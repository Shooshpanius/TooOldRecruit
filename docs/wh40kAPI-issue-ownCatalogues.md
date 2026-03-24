# Задача для wh40kAPI: `/ownCatalogues` возвращает неполный список каталогов

## Статус

**Закрыта.** Реализовано в коммитах
[`76ceb4c`](https://github.com/Shooshpanius/wh40kAPI/commit/76ceb4c) и
[`2ea5612`](https://github.com/Shooshpanius/wh40kAPI/commit/2ea5612).

`CollectCatalogueIdsAsync(id, importRootEntriesOnly: true)` уже выполняет
**рекурсивный обход BFS** по `catalogueLinks` с `importRootEntries=true`:
загружает все ссылки из БД одним запросом, фильтрует по `ImportRootEntries=true`
и обходит граф в ширину. Возвращает полное множество достижимых каталогов.

Задача была создана по ошибке — на основе поведения старой версии API до
применения исправления. Реальный ответ API уже соответствует ожидаемому.

---

## Исходная постановка (для истории)

Предполагалось, что `GET /fractions/{id}/ownCatalogues` возвращает только ID
основного каталога фракции, не включая каталоги, связанные через `catalogueLinks`
с `importRootEntries="true"`.

### Death Guard (`5108-f98-63c2-53cb`)

| Каталог | catalogueId |
|---------|-------------|
| Chaos - Daemons Library | `b45c-af22-788a-dfd6` |
| Chaos Space Marines Legends | `ac3b-689c-4ad4-70cb` |

API корректно возвращает все три ID, включая библиотечные каталоги.

### Imperial Knights (`25dd-7aa0-6bf4-f2d5`)

| Каталог | catalogueId |
|---------|-------------|
| Imperium - Imperial Knights - Library | `1b6d-dc06-5db9-c7d1` |
| Imperium - Agents of the Imperium | `b00-cd86-4b4c-97ba` |
| Library - Titans | `7481-280e-b55e-7867` |

API корректно возвращает все четыре ID.

---

## Состояние TooOldRecruit

`fetchOwnCatalogueIds()` в `api.ts` использует ответ API как основной источник.
Статический `FACTION_OWN_CATALOGUE_IDS` остаётся **только как сетевой фолбэк**
на случай недоступности API (не как компенсация бага).

`FACTION_ALLIED_CATALOGUE_IDS` для Adeptus Mechanicus (`77b9`) сохраняется —
это намеренная бизнес-логика: IK Library / Agents / Titans являются союзными
для AM, даже несмотря на `importRootEntries="true"` в BSData.

