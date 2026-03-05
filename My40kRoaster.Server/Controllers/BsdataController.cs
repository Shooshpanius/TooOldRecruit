using Microsoft.AspNetCore.Mvc;

namespace My40kRoaster.Server.Controllers
{
    [ApiController]
    [Route("api/bsdata")]
    public class BsdataController(IHttpClientFactory httpClientFactory) : ControllerBase
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
