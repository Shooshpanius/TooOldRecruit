using Microsoft.EntityFrameworkCore;
using My40kRoaster.Server.Data;
using My40kRoaster.Server.Models;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace My40kRoaster.Server.Services
{
    public class BsDataImportService(IHttpClientFactory httpClientFactory, AppDbContext db)
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };

        /// <summary>
        /// Returns locally cached units for a faction, importing from the external API if not yet cached.
        /// </summary>
        public async Task<List<BsDataUnit>> GetOrImportUnitsAsync(string factionId, CancellationToken ct = default)
        {
            var cached = await db.BsDataUnits
                .Where(u => u.FactionId == factionId)
                .Include(u => u.CostTiers)
                .ToListAsync(ct)
                .ConfigureAwait(false);

            if (cached.Count > 0)
                return cached;

            return await ImportAsync(factionId, ct).ConfigureAwait(false);
        }

        /// <summary>
        /// Fetches units from the external API for the given faction, parses cost tiers,
        /// stores the result in the database and returns the stored units.
        /// </summary>
        public async Task<List<BsDataUnit>> ImportAsync(string factionId, CancellationToken ct = default)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client
                .GetAsync($"fractions/{Uri.EscapeDataString(factionId)}/units", ct)
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                return [];

            var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

            List<ApiUnitItem> items;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Object
                    && root.TryGetProperty("units", out var arr)
                    && arr.ValueKind == JsonValueKind.Array)
                    items = JsonSerializer.Deserialize<List<ApiUnitItem>>(arr.GetRawText(), JsonOptions) ?? [];
                else if (root.ValueKind == JsonValueKind.Array)
                    items = JsonSerializer.Deserialize<List<ApiUnitItem>>(json, JsonOptions) ?? [];
                else
                    return [];
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException)
            {
                return [];
            }

            // Remove any previous data for this faction before re-importing
            var existing = await db.BsDataUnits
                .Where(u => u.FactionId == factionId)
                .ToListAsync(ct)
                .ConfigureAwait(false);
            db.BsDataUnits.RemoveRange(existing);

            var units = new List<BsDataUnit>();
            foreach (var item in items)
            {
                if (string.IsNullOrEmpty(item.Id) && string.IsNullOrEmpty(item.Name))
                    continue;

                var unitId = !string.IsNullOrEmpty(item.Id) ? item.Id : item.Name!;

                // Avoid duplicate IDs within the same faction import
                if (units.Any(u => u.Id == unitId))
                    continue;

                var unit = new BsDataUnit
                {
                    Id = unitId,
                    FactionId = factionId,
                    Name = item.Name ?? string.Empty,
                    Category = ResolveCategory(item),
                    Cost = ResolveBaseCost(item),
                    IsLeader = item.InfoLinks?.Any(l => l.Type == "rule" && l.Name == "Leader") ?? false,
                    MaxInRoster = item.MaxInRoster is not null ? ToInt(item.MaxInRoster) : null,
                    CostTiers = ParseCostTiers(unitId, item)
                };

                units.Add(unit);
            }

            // For units with no inline cost tiers, fetch from the dedicated endpoint.
            await FetchAndApplyCostTiersAsync(client, units, ct).ConfigureAwait(false);

            db.BsDataUnits.AddRange(units);
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return units;
        }

        /// <summary>
        /// Fetches cost tiers for units that have none from inline parsing, using the
        /// dedicated <c>/units/{id}/cost-tiers</c> API endpoint.
        /// Requests are issued in parallel (max <see cref="MaxConcurrentCostTierRequests"/>
        /// concurrent) and per-unit failures are logged but do not abort the import.
        /// </summary>
        private async Task FetchAndApplyCostTiersAsync(
            HttpClient client, List<BsDataUnit> units, CancellationToken ct)
        {
            var unitsWithoutTiers = units.Where(u => u.CostTiers.Count == 0).ToList();
            if (unitsWithoutTiers.Count == 0) return;

            using var semaphore = new System.Threading.SemaphoreSlim(
                MaxConcurrentCostTierRequests, MaxConcurrentCostTierRequests);

            var tasks = unitsWithoutTiers.Select(async unit =>
            {
                await semaphore.WaitAsync(ct).ConfigureAwait(false);
                try
                {
                    using var r = await client
                        .GetAsync($"units/{Uri.EscapeDataString(unit.Id)}/cost-tiers", ct)
                        .ConfigureAwait(false);

                    if (!r.IsSuccessStatusCode) return;

                    var json = await r.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                    var tiers = JsonSerializer.Deserialize<List<ApiCostTierItem>>(json, JsonOptions);
                    if (tiers is null || tiers.Count == 0) return;

                    unit.CostTiers = tiers
                        .Where(t => t.Points > 0)
                        .Select(t => new BsDataCostTier
                        {
                            UnitId = unit.Id,
                            MinModels = t.MinModels,
                            MaxModels = t.MaxModels,
                            Points = t.Points
                        })
                        .ToList();
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Non-critical: log and continue so one bad unit doesn't break the import
                    Console.Error.WriteLine(
                        $"[BsDataImport] Failed to fetch cost tiers for unit '{unit.Id}': {ex.Message}");
                }
                finally { semaphore.Release(); }
            });

            await Task.WhenAll(tasks).ConfigureAwait(false);
        }

        private const int MaxConcurrentCostTierRequests = 10;

        // ── helpers ──────────────────────────────────────────────────────────

        private static string ResolveCategory(ApiUnitItem item)
        {
            var cats = item.Categories ?? item.UnitCategories;
            return cats?.FirstOrDefault(c => c.Primary)?.Name
                ?? cats?.FirstOrDefault()?.Name
                ?? item.Category
                ?? item.CategoryName
                ?? item.EntryType
                ?? item.Type
                ?? "Other";
        }

        private static int? ResolveBaseCost(ApiUnitItem item)
        {
            if (item.Cost is not null) return ToInt(item.Cost);
            if (item.Points is not null) return ToInt(item.Points);
            if (item.Pts is not null) return ToInt(item.Pts);
            if (item.PointCost is not null) return ToInt(item.PointCost);
            if (item.Costs is JsonElement costsElem)
            {
                if (costsElem.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in costsElem.EnumerateArray())
                    {
                        if (el.TryGetProperty("value", out var val))
                            return ToInt(val);
                    }
                }
                else
                {
                    return ToInt(costsElem);
                }
            }
            return null;
        }

        /// <summary>
        /// Parses cost-tier data from the API unit item.
        /// Tries a <c>costTiers</c> / <c>costBands</c> array first, then falls back to a
        /// <c>costs</c> array whose elements carry <c>minModels</c>/<c>maxModels</c>.
        /// </summary>
        private static List<BsDataCostTier> ParseCostTiers(string unitId, ApiUnitItem item)
        {
            // 1. Dedicated costTiers / costBands field
            var tiersElem = item.CostTiers ?? item.CostBands;
            if (tiersElem is JsonElement te && te.ValueKind == JsonValueKind.Array)
            {
                var result = new List<BsDataCostTier>();
                foreach (var el in te.EnumerateArray())
                {
                    var tier = new BsDataCostTier
                    {
                        UnitId = unitId,
                        MinModels = GetIntProp(el, "minModels", "min_models", "min"),
                        MaxModels = GetIntProp(el, "maxModels", "max_models", "max"),
                        Points = GetIntProp(el, "pts", "points", "cost", "value")
                    };
                    if (tier.Points > 0)
                        result.Add(tier);
                }
                // Multiple bands OR a single band that spans a model range (variable count)
                if (result.Count > 1) return result;
                if (result.Count == 1 && result[0].MinModels != result[0].MaxModels) return result;
            }

            // 2. costs array whose items include model-count boundaries
            if (item.Costs is JsonElement costsElem && costsElem.ValueKind == JsonValueKind.Array)
            {
                var result = new List<BsDataCostTier>();
                foreach (var el in costsElem.EnumerateArray())
                {
                    bool hasMin = el.TryGetProperty("minModels", out _) || el.TryGetProperty("min_models", out _);
                    bool hasMax = el.TryGetProperty("maxModels", out _) || el.TryGetProperty("max_models", out _);
                    if (!hasMin && !hasMax) continue;

                    var tier = new BsDataCostTier
                    {
                        UnitId = unitId,
                        MinModels = GetIntProp(el, "minModels", "min_models"),
                        MaxModels = GetIntProp(el, "maxModels", "max_models"),
                        Points = GetIntProp(el, "pts", "points", "value", "cost")
                    };
                    if (tier.Points > 0)
                        result.Add(tier);
                }
                // Multiple bands OR a single band that spans a model range (variable count)
                if (result.Count > 1) return result;
                if (result.Count == 1 && result[0].MinModels != result[0].MaxModels) return result;
            }

            return [];
        }

        private static int GetIntProp(JsonElement el, params string[] names)
        {
            foreach (var name in names)
            {
                if (el.TryGetProperty(name, out var prop))
                    return ToInt(prop) ?? 0;
            }
            return 0;
        }

        private static int? ToInt(object? val)
        {
            if (val is null) return null;
            if (val is JsonElement je)
            {
                return je.ValueKind switch
                {
                    JsonValueKind.Number => je.TryGetInt32(out var i) ? i : (int?)Math.Round(je.GetDouble()),
                    JsonValueKind.String => int.TryParse(je.GetString(), out var s)
                        ? s
                        : double.TryParse(je.GetString(),
                            System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture,
                            out var d)
                            ? (int)Math.Round(d)
                            : (int?)null,
                    _ => null
                };
            }
            try { return Convert.ToInt32(val); } catch { return null; }
        }

        // ── API DTOs ─────────────────────────────────────────────────────────

        private sealed class ApiUnitItem
        {
            public string? Id { get; set; }
            public string? Name { get; set; }
            public string? EntryType { get; set; }
            public string? Type { get; set; }
            public string? Category { get; set; }
            public string? CategoryName { get; set; }
            public List<ApiCategory>? Categories { get; set; }
            public List<ApiCategory>? UnitCategories { get; set; }
            public JsonElement? Cost { get; set; }
            public JsonElement? Points { get; set; }
            public JsonElement? Pts { get; set; }
            public JsonElement? PointCost { get; set; }
            public JsonElement? Costs { get; set; }
            /// <summary>Dedicated cost-tier array, e.g. [{minModels,maxModels,pts}].</summary>
            public JsonElement? CostTiers { get; set; }
            /// <summary>Alias used by some API versions.</summary>
            public JsonElement? CostBands { get; set; }
            public List<ApiInfoLink>? InfoLinks { get; set; }
            public JsonElement? MaxInRoster { get; set; }
        }

        private sealed class ApiCategory
        {
            public string? Id { get; set; }
            public string? Name { get; set; }
            public bool Primary { get; set; }
        }

        private sealed class ApiInfoLink
        {
            public string? Id { get; set; }
            public string? Name { get; set; }
            public string? Type { get; set; }
            public string? TargetId { get; set; }
        }

        /// <summary>Maps the response body of <c>/units/{id}/cost-tiers</c>.</summary>
        private sealed class ApiCostTierItem
        {
            public int MinModels { get; set; }
            public int MaxModels { get; set; }
            public int Points { get; set; }
        }
    }
}
