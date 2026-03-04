using Microsoft.AspNetCore.Mvc;
using My40kRoaster.Server.Services;

namespace My40kRoaster.Server.Controllers
{
    [ApiController]
    [Route("api/bsdata")]
    public class BsdataController(IHttpClientFactory httpClientFactory, BsDataImportService importService) : ControllerBase
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

        /// <summary>
        /// Returns units for a faction, including cost-tier data.
        /// Data is fetched from the external API on first request and cached locally.
        /// The response is a JSON object with a "units" array whose items include a
        /// "costTiers" array (may be empty for fixed-cost units).
        /// </summary>
        [HttpGet("fractions/{id}/units")]
        public async Task<IActionResult> GetFractionUnits(string id, CancellationToken ct)
        {
            var units = await importService
                .GetOrImportUnitsAsync(id, ct)
                .ConfigureAwait(false);

            if (units.Count == 0)
            {
                // Fall back to transparent proxy so the frontend still gets raw data
                var client = httpClientFactory.CreateClient("wh40kapi");
                using var response = await client
                    .GetAsync($"fractions/{Uri.EscapeDataString(id)}/units", ct)
                    .ConfigureAwait(false);
                var content = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                return new ContentResult
                {
                    Content = content,
                    ContentType = "application/json; charset=utf-8",
                    StatusCode = (int)response.StatusCode
                };
            }

            var dto = new
            {
                units = units.Select(u => new
                {
                    id = u.Id,
                    name = u.Name,
                    category = u.Category,
                    cost = u.Cost,
                    isLeader = u.IsLeader,
                    maxInRoster = u.MaxInRoster,
                    costTiers = u.CostTiers
                        .OrderBy(t => t.MinModels)
                        .Select(t => new
                        {
                            minModels = t.MinModels,
                            maxModels = t.MaxModels,
                            pts = t.Points
                        })
                })
            };

            return Ok(dto);
        }

        /// <summary>
        /// Forces a re-import of unit data (including cost tiers) for the specified faction.
        /// </summary>
        [HttpPost("fractions/{id}/units/import")]
        public async Task<IActionResult> ImportFractionUnits(string id, CancellationToken ct)
        {
            var units = await importService.ImportAsync(id, ct).ConfigureAwait(false);
            return Ok(new { imported = units.Count });
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
    }
}
