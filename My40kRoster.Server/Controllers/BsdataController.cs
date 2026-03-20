using System.Text.Json;
using System.Text.Json.Nodes;
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

        // Прокси к нативному эндпоинту wh40kAPI GET /fractions/{id}/unitsList.
        // Возвращает облегчённое дерево юнитов без характеристик (profiles не загружаются из БД).
        // Используется для быстрого отображения списка отрядов в каталоге;
        // полные характеристики загружаются по запросу через /units/{id}/full-node.
        // Реализовано в wh40kAPI: Shooshpanius/wh40kAPI@59348c7
        //
        // WORKAROUND: дополнительно обрезает поля, не нужные для отображения списка отрядов.
        // Когда wh40kAPI нативно исключит эти поля из /unitsList (см. docs/wh40kAPI-issue-unitsList-slim.md),
        // методы StripUnitsListJson / StripUnitsListNode / StripInfoLinkFields можно удалить,
        // а этот эндпоинт упростить до обычного прокси без постобработки.
        //   • у корневых узлов (глубина 0) удаляет вспомогательные подполя infoLinks: id и targetId
        //     (клиент использует только type и name — для проверки Leader и названий способностей);
        //   • у дочерних узлов (глубина ≥ 1) удаляет infoLinks целиком (ключевые слова оружия
        //     приходят через /units/{id}/full-node при выборе отряда) и categories/unitCategories
        //     (состав отряда в каталоге не отображает категорию отдельных моделей).
        [HttpGet("fractions/{id}/units-list")]
        public async Task<IActionResult> GetFractionUnitsList(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/unitsList").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
                content = StripUnitsListJson(content);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode,
            };
        }

        // Обрезает лишние поля из ответа unitsList, чтобы уменьшить размер payload.
        // Корневые узлы: из каждого infoLink удаляются id и targetId.
        // Дочерние узлы (любой глубины): infoLinks удаляется целиком; categories и unitCategories удаляются.
        // При ошибке парсинга возвращается исходная строка без изменений.
        private static string StripUnitsListJson(string json)
        {
            try
            {
                var root = JsonNode.Parse(json);
                if (root == null) return json;

                JsonArray? nodes = root as JsonArray
                    ?? (root as JsonObject)?["units"] as JsonArray
                    ?? (root as JsonObject)?["children"] as JsonArray
                    ?? (root as JsonObject)?["nodes"] as JsonArray;

                if (nodes != null)
                {
                    foreach (var node in nodes)
                        StripUnitsListNode(node as JsonObject, isRoot: true);
                }

                return root.ToJsonString();
            }
            catch (JsonException)
            {
                return json;
            }
            catch (InvalidOperationException)
            {
                return json;
            }
        }

        private static void StripUnitsListNode(JsonObject? node, bool isRoot)
        {
            if (node == null) return;

            if (isRoot)
            {
                // Корневой узел: удаляем из каждого infoLink неиспользуемые поля id и targetId.
                // Клиент использует только type (для определения leader/rule) и name (для отображения).
                if (node["infoLinks"] is JsonArray links)
                    StripInfoLinkFields(links);
            }
            else
            {
                // Дочерний узел: infoLinks не нужны (ключевые слова оружия загружаются через fullNode).
                // categories не нужны — состав отряда в каталоге отображается без категории модели.
                node.Remove("infoLinks");
                node.Remove("categories");
                node.Remove("unitCategories");
            }

            // Рекурсивно обрабатываем дочерние узлы.
            if (node["children"] is JsonArray children)
            {
                foreach (var child in children)
                    StripUnitsListNode(child as JsonObject, isRoot: false);
            }
        }

        // Удаляет из массива infoLinks неиспользуемые подполя id и targetId.
        // Клиент использует только type и name для определения Leader и названий способностей.
        private static void StripInfoLinkFields(JsonArray links)
        {
            foreach (var link in links)
            {
                if (link is JsonObject linkObj)
                {
                    linkObj.Remove("id");
                    linkObj.Remove("targetId");
                }
            }
        }

        // Прокси к эндпоинту wh40kAPI GET /units/{id}/fullNode.
        // Возвращает полный BsDataUnitNode для одного юнита: характеристики (profiles),
        // дочерние upgrade-узлы (оружие) с их profiles и infoLinks.
        // Используется для отображения полного датащита выбранного отряда в каталоге.
        // Реализовано в wh40kAPI: Shooshpanius/wh40kAPI@59348c7
        [HttpGet("units/{id}/full-node")]
        public async Task<IActionResult> GetUnitFullNode(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"units/{Uri.EscapeDataString(id)}/fullNode").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return new ContentResult
            {
                Content = content,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode,
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
