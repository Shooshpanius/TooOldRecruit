using System.Text.Json;
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
        // Реализовано в wh40kAPI@8cc4caa. При ошибке upstream возвращает 200 с пустым массивом —
        // клиент в этом случае не применяет фильтрацию по детачменту.
        [HttpGet("fractions/{id}/detachment-conditions")]
        public async Task<IActionResult> GetFractionDetachmentConditions(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/detachment-conditions").ConfigureAwait(false);
            // При ошибке upstream (например, недоступность сети) — возвращаем пустой массив.
            // Клиент при получении [] не применяет фильтрацию по детачменту.
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
        // Возвращает облегчённое дерево юнитов: без profiles, без infoLinks на дочерних узлах,
        // без categories/unitCategories на дочерних узлах, только type+name в infoLinks корневых узлов.
        // Используется для быстрого отображения списка отрядов в каталоге;
        // полные характеристики загружаются по запросу через /units/{id}/full-node.
        //
        // Временная серверная зачистка (до реализации исправлений в wh40kAPI, см. docs/wh40kAPI-issue-unitsList-slim-2.md):
        // — убирает categories и infoLinks из узлов depth ≥ 1;
        // — убирает поля id/unitId из объектов categories и costTiers;
        // — возвращает минифицированный JSON (без отступов).
        [HttpGet("fractions/{id}/units-list")]
        public async Task<IActionResult> GetFractionUnitsList(string id)
        {
            var client = httpClientFactory.CreateClient("wh40kapi");
            using var response = await client.GetAsync($"fractions/{Uri.EscapeDataString(id)}/unitsList").ConfigureAwait(false);
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            var stripped = StripUnitsListResponse(content);
            return new ContentResult
            {
                Content = stripped,
                ContentType = "application/json; charset=utf-8",
                StatusCode = (int)response.StatusCode,
            };
        }

        /// <summary>
        /// Strips unnecessary fields from the wh40kAPI /unitsList response and returns minified JSON.
        /// Removes: categories/infoLinks from depth≥1 nodes; id/unitId from categories and costTiers objects.
        /// Falls back to original content on parse errors.
        /// </summary>
        private static string StripUnitsListResponse(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                    return json;

                using var ms = new System.IO.MemoryStream();
                using (var writer = new Utf8JsonWriter(ms))
                {
                    WriteNodeArray(writer, doc.RootElement, depth: 0);
                }
                return System.Text.Encoding.UTF8.GetString(ms.ToArray());
            }
            catch (JsonException)
            {
                return json;
            }
        }

        private static void WriteNodeArray(Utf8JsonWriter writer, JsonElement array, int depth)
        {
            writer.WriteStartArray();
            foreach (var element in array.EnumerateArray())
                WriteNode(writer, element, depth);
            writer.WriteEndArray();
        }

        private static void WriteNode(Utf8JsonWriter writer, JsonElement node, int depth)
        {
            writer.WriteStartObject();
            foreach (var prop in node.EnumerateObject())
            {
                switch (prop.Name)
                {
                    case "categories":
                        writer.WritePropertyName("categories");
                        if (depth == 0)
                            WriteSlimCategories(writer, prop.Value);
                        else
                            WriteEmptyArray(writer);
                        break;

                    case "infoLinks":
                        writer.WritePropertyName("infoLinks");
                        if (depth == 0)
                            prop.Value.WriteTo(writer);
                        else
                            WriteEmptyArray(writer);
                        break;

                    case "costTiers":
                        writer.WritePropertyName("costTiers");
                        WriteSlimCostTiers(writer, prop.Value);
                        break;

                    case "children":
                        writer.WritePropertyName("children");
                        WriteNodeArray(writer, prop.Value, depth + 1);
                        break;

                    case "points":
                        writer.WritePropertyName("points");
                        if (prop.Value.ValueKind == JsonValueKind.Null)
                            writer.WriteNullValue();
                        else if (prop.Value.ValueKind == JsonValueKind.Number)
                            writer.WriteNumberValue(prop.Value.GetDouble());
                        else
                            prop.Value.WriteTo(writer);
                        break;

                    default:
                        prop.WriteTo(writer);
                        break;
                }
            }
            writer.WriteEndObject();
        }

        /// <summary>Writes categories array keeping only name and primary fields.</summary>
        private static void WriteSlimCategories(Utf8JsonWriter writer, JsonElement categories)
        {
            writer.WriteStartArray();
            foreach (var cat in categories.EnumerateArray())
            {
                writer.WriteStartObject();
                if (cat.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                    writer.WriteString("name", name.GetString());
                if (cat.TryGetProperty("primary", out var primary) && (primary.ValueKind == JsonValueKind.True || primary.ValueKind == JsonValueKind.False))
                    writer.WriteBoolean("primary", primary.GetBoolean());
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }

        /// <summary>Writes costTiers array keeping only minModels, maxModels and points fields.</summary>
        private static void WriteSlimCostTiers(Utf8JsonWriter writer, JsonElement costTiers)
        {
            writer.WriteStartArray();
            foreach (var tier in costTiers.EnumerateArray())
            {
                writer.WriteStartObject();
                if (tier.TryGetProperty("minModels", out var minModels) && minModels.ValueKind == JsonValueKind.Number)
                    writer.WriteNumber("minModels", minModels.GetInt32());
                if (tier.TryGetProperty("maxModels", out var maxModels) && maxModels.ValueKind == JsonValueKind.Number)
                    writer.WriteNumber("maxModels", maxModels.GetInt32());
                if (tier.TryGetProperty("points", out var points) && points.ValueKind == JsonValueKind.Number)
                    writer.WriteNumber("points", points.GetDouble());
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }

        private static void WriteEmptyArray(Utf8JsonWriter writer)
        {
            writer.WriteStartArray();
            writer.WriteEndArray();
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
