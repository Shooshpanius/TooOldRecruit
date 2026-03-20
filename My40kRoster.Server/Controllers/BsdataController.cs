using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Nodes;

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

        // Прокси к эндпоинту wh40kAPI GET /fractions/{id}/ownCatalogues.
        // Возвращает список «собственных» catalogueId фракции: сам каталог фракции плюс
        // все каталоги, достижимые через catalogueLinks с importRootEntries="true" (рекурсивно).
        // Юниты из этих каталогов являются основной частью фракции, а не «Allied Units».
        //
        // Зависимость (BSData): атрибут importRootEntries="true" в <catalogueLink> означает,
        // что все корневые записи целевого каталога импортируются напрямую в данную фракцию.
        // Пример: Chaos Knights (46d8-abc8-ef3a-9f85) → CK Library (8106-aad2-918a-9ac)
        //         с importRootEntries="true", поэтому Cerastus и War Dog — НЕ Allied.
        //         CSM (c8da-e875-58f7-f6d6) связан БЕЗ importRootEntries → Allied.
        //
        // Реализовано в wh40kAPI: Shooshpanius/wh40kAPI@2ea5612
        // При сетевой ошибке или ответе не-2xx возвращает пустой массив [];
        // клиент в этом случае использует статический FACTION_OWN_CATALOGUE_IDS как резервный источник.
        [HttpGet("fractions/{id}/own-catalogues")]
        public async Task<IActionResult> GetFractionOwnCatalogues(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/ownCatalogues").ConfigureAwait(false);
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

        // Прокси к эндпоинту wh40kAPI GET /fractions/{id}/unitsTree, но с удалёнными полями profiles.
        // Возвращает облегчённое дерево юнитов — только структурные данные (id, name, entryType,
        // categories, costs, modifierGroups, infoLinks, children и т.д.) без характеристик юнитов
        // и без характеристик оружия. Используется в каталоге для быстрого отображения списка
        // отрядов: клиент получает список сразу, а полные характеристики загружает отдельно
        // (фоновая загрузка через /fractions/{id}/unitsTree).
        //
        // Пока wh40kAPI не реализовал нативный лёгкий эндпоинт /fractions/{id}/unitsList,
        // TooOldRecruit удаляет поле profiles на стороне сервера, сокращая размер ответа.
        // Задача для wh40kAPI: docs/wh40kAPI-issue-split-catalog-api.md
        [HttpGet("fractions/{id}/units-list")]
        public async Task<IActionResult> GetFractionUnitsList(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/unitsTree").ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var errContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return new ContentResult { Content = errContent, ContentType = "application/json; charset=utf-8", StatusCode = (int)response.StatusCode };
            }
            var json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            var nodes = JsonNode.Parse(json);
            StripProfilesRecursive(nodes);
            return new ContentResult
            {
                Content = nodes?.ToJsonString() ?? "[]",
                ContentType = "application/json; charset=utf-8",
                StatusCode = 200,
            };
        }

        // Рекурсивно удаляет поле "profiles" из JSON-узлов дерева юнитов.
        private static void StripProfilesRecursive(JsonNode? node)
        {
            if (node is JsonArray array)
            {
                foreach (var item in array)
                    StripProfilesRecursive(item);
            }
            else if (node is JsonObject obj)
            {
                obj.Remove("profiles");
                if (obj["children"] is JsonNode children)
                    StripProfilesRecursive(children);
            }
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

        // Прокси к эндпоинту wh40kAPI GET /units/{id}/profiles.
        // Возвращает BSData профили юнита: характеристики (M/T/Sv/W/Ld/OC для юнита,
        // Range/A/BS/S/AP/D для оружия) и тип профиля (typeName).
        [HttpGet("units/{id}/profiles")]
        public async Task<IActionResult> GetUnitProfiles(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"units/{Uri.EscapeDataString(id)}/profiles").ConfigureAwait(false);
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
