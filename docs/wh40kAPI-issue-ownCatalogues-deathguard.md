# Задача для wh40kAPI: `/ownCatalogues` не возвращает Daemons Library для Death Guard

## Статус

**Открыта.**

---

## Симптом

В интерфейсе TooOldRecruit в разделе **Allied Units** для фракции **Death Guard**
отображаются юниты, которые не должны быть союзными:

- **Группа «Epic Hero»** — Be'lakor, Epidemius, Horticulous Slimux, Kairos Fateweaver и др.
- **Группа «Others»** — компонентные модели без primary-категории (Alluress, Bloodletter,
  Bloodcrusher, Daemonette и др.)

Ожидаемый список Allied Units для Death Guard содержит **только** юниты из
Chaos Knights Library (`8106-aad2-918a-9ac`) и Library - Titans (`7481-280e-b55e-7867`)
плюс отдельные записи Unaligned Forces (`581a-46b9-5b86-44b7`) с первичной категорией
«Allied Units» (Ambull, Guardian Drone, Spindle Drones и т.д.).

---

## Корневая причина

`GET /fractions/{id}/ownCatalogues` для Death Guard (`5108-f98-63c2-53cb`) возвращает
**неполный список** — не включает **Chaos - Daemons Library** (`b45c-af22-788a-dfd6`).

TooOldRecruit использует ответ `/ownCatalogues` как основной источник «собственных»
каталогов фракции. Если каталог отсутствует в этом множестве, все его юниты
классифицируются как Allied:

```
fetchOwnCatalogueIds() → Set(["5108-f98-63c2-53cb", ...])
                          ↑ b45c-af22-788a-dfd6 отсутствует
→ ownCatalogueIds.has("b45c-af22-788a-dfd6") = false
→ isAlliedSection = true для всех юнитов Daemons Library
→ Be'lakor, Plaguebearers и др. отображаются как Allied (неверно)
```

Статический фолбэк `FACTION_OWN_CATALOGUE_IDS['5108-f98-63c2-53cb']` в TooOldRecruit
содержит корректные данные (`b45c-af22-788a-dfd6` и `ac3b-689c-4ad4-70cb`), однако
применяется **только при сетевой ошибке** (когда `/ownCatalogues` возвращает пустой массив
или недоступен). Если API вернул непустой, но неполный список — фолбэк не срабатывает.

---

## Ожидаемый ответ `/ownCatalogues` для Death Guard

```json
[
  "5108-f98-63c2-53cb",   // Chaos - Death Guard (основной каталог)
  "b45c-af22-788a-dfd6",  // Chaos - Daemons Library       ← должен присутствовать
  "ac3b-689c-4ad4-70cb"   // Chaos Space Marines Legends   ← должен присутствовать
]
```

`CollectCatalogueIdsAsync(id, importRootEntriesOnly: true)` должен обходить все
`catalogueLinks` с `importRootEntries="true"` рекурсивно. Если это работает корректно,
причина неполного ответа — **изменение в BSData**: у Death Guard ссылка на Daemons Library
могла быть обновлена (убран или изменён атрибут `importRootEntries`).

---

## Что нужно проверить в wh40kAPI

1. **Запустить отладочный запрос**: `GET /fractions/5108-f98-63c2-53cb/ownCatalogues`
   и проверить, возвращает ли он `b45c-af22-788a-dfd6`.

2. **Проверить BSData**: в файле `Chaos - Death Guard.cat` (репозиторий BSData/wh40k-10e)
   найти `<catalogueLinks>` и убедиться, что ссылка на Daemons Library
   (`targetId="b45c-af22-788a-dfd6"`) содержит `importRootEntries="true"`.
   Если атрибут отсутствует или равен `"false"` — это BSData-изменение,
   требующее либо правки BSData, либо иного механизма классификации в wh40kAPI.

3. **Проверить синхронизацию данных**: если BSData была обновлена после последней
   синхронизации БД wh40kAPI, `CollectCatalogueIdsAsync` будет работать с устаревшими
   данными и возвращать неполное множество.

---

## Возможные пути решения

### Вариант A: BSData и importRootEntries в порядке — регрессия в wh40kAPI

Если BSData по-прежнему содержит `importRootEntries="true"` для Daemons Library
в Death Guard — значит, BFS-обход в `CollectCatalogueIdsAsync` сломан (регрессия).
Нужно восстановить правильное поведение (ср. коммиты `76ceb4c`, `2ea5612`).

### Вариант B: BSData убрал importRootEntries — нужен новый механизм

Если BSData изменил ссылку и `importRootEntries` больше нет, `ownCatalogues` не может
определить «свои» каталоги только по этому флагу. Возможные решения:

- Добавить в wh40kAPI явный endpoint или поле, позволяющее TooOldRecruit различать
  «own» и «allied» каталоги через другой признак BSData (например, наличие корневых
  entryLinks с условиями детачмента — признак Allied; отсутствие — признак own).
- Или: добавить конфигурируемый на стороне wh40kAPI список «собственных» каталогов
  для фракций, у которых BSData не кодирует это однозначно через `importRootEntries`.

---

## Состояние TooOldRecruit

**Частичное исправление применено** (коммит в ветке `copilot/fix-death-guard-allied-units`):

- `collectUnits()` в `api.ts` теперь использует `classificationMap` для фильтрации
  компонентных моделей-артефактов в Allied-разделе: модель без primary-категории
  пропускается, если `classificationMap` доступна и не содержит primary-категории
  для этого узла. Это устраняет группу **«Others»** в Allied Units.

- Группа **«Epic Hero»** (Be'lakor и др.) и другие юниты Daemons Library с primary-
  категорией **по-прежнему некорректно отображаются в Allied Units** до исправления
  `/ownCatalogues` в wh40kAPI.

Статический `FACTION_OWN_CATALOGUE_IDS['5108-f98-63c2-53cb']` в `api.ts` остаётся
как сетевой фолбэк и содержит корректные данные, но не применяется при непустом
(хотя и неполном) ответе API.
