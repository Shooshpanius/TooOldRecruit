using Microsoft.AspNetCore.Mvc;

namespace My40kRoster.Server.Controllers
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

        // Прокси к эндпоинту wh40kAPI, который возвращает список детачментов фракции.
        [HttpGet("fractions/{id}/detachments")]
        public async Task<IActionResult> GetFractionDetachments(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/detachments").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode
            };
        }

        // Прокси к эндпоинту wh40kAPI, возвращающему условия детачмента для юнитов фракции.
        // wh40kAPI возвращает [{unitId, detachmentIds[]}] — список юнитов, доступных только
        // при определённых детачментах (на основе entryLink-модификаторов из BSData .cat-файлов).
        // До реализации этого эндпоинта в wh40kAPI возвращает пустой массив [];
        // клиент в этом случае использует статический DETACHMENT_EXCLUSIVE_UNITS как резервный источник.
        // Задача для wh40kAPI: https://github.com/Shooshpanius/wh40kAPI/issues/
        [HttpGet("fractions/{id}/detachment-conditions")]
        public async Task<IActionResult> GetFractionDetachmentConditions(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/detachment-conditions").ConfigureAwait(false);
            // Если wh40kAPI ещё не реализовал эндпоинт — возвращаем пустой массив.
            // Клиент при получении [] автоматически использует статический DETACHMENT_EXCLUSIVE_UNITS.
            if (!response.IsSuccessStatusCode)
                return new ContentResult { Content = "[]", ContentType = "application/json; charset=utf-8", StatusCode = 200 };
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = 200
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
