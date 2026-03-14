using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace My40kRoster.Server.Controllers
{
    [ApiController]
    [Route("api/bsdata")]
    public class BsdataController(IHttpClientFactory httpClientFactory, ILogger<BsdataController> logger) : ControllerBase
    {
        [HttpGet("catalogues")]
        public async Task<IActionResult> GetCatalogues()
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync("catalogues").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("catalogues/{id}/units")]
        public async Task<IActionResult> GetCatalogueUnits(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"catalogues/{id}/units").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("fractions")]
        public async Task<IActionResult> GetFractions()
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync("fractions").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("fractions/{id}/units")]
        public async Task<IActionResult> GetFractionUnits(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/units").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("fractions/{id}/unitsWithCosts")]
        public async Task<IActionResult> GetFractionUnitsWithCosts(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/unitsWithCosts").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("fractions/{id}/unitsTree")]
        public async Task<IActionResult> GetFractionUnitsTree(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/unitsTree").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        // Возвращает список детачментов фракции, парсингом из плоского списка юнитов.
        // Структура BSData: корневой узел name="Detachment", entryType="upgrade", category="Configuration"
        // → child entryType="selectionEntryGroup" → grandchildren с реальными именами детачментов.
        [HttpGet("fractions/{id}/detachments")]
        public async Task<IActionResult> GetFractionDetachments(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/units").ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return new ContentResult
                {
                    Content = errorContent,
                    ContentType = "application/json; charset=utf-8",
                    StatusCode = (int)response.StatusCode
                };
            }

            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            var detachmentNames = new List<string>();

            try
            {
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                // Перебираем все корневые узлы (parentId=null, entryType="upgrade", category="Configuration")
                var items = root.ValueKind == JsonValueKind.Array
                    ? root.EnumerateArray()
                    : Enumerable.Empty<JsonElement>();

                foreach (var item in items)
                {
                    if (!IsDetachmentNode(item)) continue;

                    // Проходим в дочерний selectionEntryGroup → его дети — реальные имена детачментов
                    if (!item.TryGetProperty("children", out var children)) continue;
                    foreach (var child in children.EnumerateArray())
                    {
                        if (!child.TryGetProperty("entryType", out var childType)) continue;
                        if (childType.GetString() != "selectionEntryGroup") continue;

                        if (!child.TryGetProperty("children", out var grandchildren)) continue;
                        foreach (var gc in grandchildren.EnumerateArray())
                        {
                            if (!gc.TryGetProperty("name", out var gcName)) continue;
                            var name = gcName.GetString();
                            if (!string.IsNullOrWhiteSpace(name))
                                detachmentNames.Add(name);
                        }
                    }
                }
            }
            catch (JsonException ex)
            {
                // Не удалось распарсить ответ BSData API — логируем и возвращаем пустой список
                logger.LogWarning(ex, "Не удалось распарсить список детачментов для фракции {FactionId}", id);
            }

            var json = JsonSerializer.Serialize(detachmentNames);
            return new ContentResult
            {
                Content = json,
                ContentType = "application/json; charset=utf-8",
                StatusCode = 200
            };
        }

        // Определяет, является ли узел корневым Detachment-узлом с категорией Configuration.
        private static bool IsDetachmentNode(JsonElement item)
        {
            // entryType должен быть "upgrade"
            if (!item.TryGetProperty("entryType", out var et) || et.GetString() != "upgrade")
                return false;

            // parentId должен быть null
            if (!item.TryGetProperty("parentId", out var pid) || pid.ValueKind != JsonValueKind.Null)
                return false;

            // categories должны содержать запись с name="Configuration"
            if (!item.TryGetProperty("categories", out var cats)) return false;
            foreach (var cat in cats.EnumerateArray())
            {
                if (cat.TryGetProperty("name", out var catName) && catName.GetString() == "Configuration")
                    return true;
            }
            return false;
        }

        [HttpGet("units/{id}/categories")]
        public async Task<IActionResult> GetUnitCategories(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"units/{Uri.EscapeDataString(id)}/categories").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        [HttpGet("units/{id}/cost-tiers")]
        public async Task<IActionResult> GetUnitCostTiers(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"units/{Uri.EscapeDataString(id)}/cost-tiers").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }
    }
}
