# Задача для wh40kAPI: дополнительная оптимизация ответа `/unitsList`

## Статус

**Закрыта.** Реализовано в коммите
[`d82a681d`](https://github.com/Shooshpanius/wh40kAPI/commit/d82a681d1051bb49437aa72cda51679e3435d3f1)
(«Slim /unitsList response: BsDataModifierGroupSlim, JsonIgnore parentId, empty catalogueId on children»).

Задача была открыта после проверки ответа `/unitsList` (коммит
[`5e68c5b9`](https://github.com/Shooshpanius/wh40kAPI/commit/5e68c5b9a5aba355859915dda4045c0555ccf1fc)),
который исключил `profiles`, убрал `infoLinks`/`categories` с дочерних узлов и спроецировал
`infoLinks` корневых узлов на slim-объект (только `type` + `name`).

## Проблема

После коммита `5e68c5b` ответ `/unitsList` всё ещё содержит поля, которые клиент
TooOldRecruit **не использует** и которые добавляют лишний вес к ответу.

### 1. `modifierGroups[].id` и `modifierGroups[].unitId`

Каждый объект `BsDataModifierGroup` сериализуется целиком, включая поля БД:

```json
{
  "id": 42,
  "unitId": "a1b2-c3d4-e5f6-7890",
  "modifiers": "...",
  "conditions": "..."
}
```

Клиент читает только `modifiers` и `conditions` (см. `applyDetachmentModifiers`,
`isUnlockedByDetachment`, `deriveXorGroups`, `getRequiredDetachmentId` в `api.ts`).
Поля `id` (целочисленный PK) и `unitId` (GUID родительского юнита — уже известен клиенту
по контексту) **никогда не читаются**.

**Решение:** ввести slim-проекцию `BsDataModifierGroupSlim` — только `modifiers` и
`conditions`; использовать её в `BsDataUnitNodeLite.ModifierGroups`.

### 2. `parentId` на всех узлах

Поле `parentId` используется только при серверном построении дерева (сборка
`parent.Children.Add(node)`). После того как иерархия собрана и вернулась клиенту в виде
вложенного JSON (поле `children`), `parentId` **не нужен**: клиент обходит дерево рекурсивно
по `children` и не читает `parentId` нигде в `mapItem()` / `buildChildTree()`.

**Решение:** исключить `parentId` из `BsDataUnitNodeLite` (или помечать `[JsonIgnore]`).

### 3. `catalogueId` на дочерних узлах

Поле `catalogueId` нужно только на корневых узлах (`depth=0`) — для определения Allied-юнитов
(сравнение с ownCatalogues в `getUnits()` в `api.ts`). На дочерних узлах (`depth≥1`)
`catalogueId` **не читается**.

**Решение:** обнулять/исключать `catalogueId` у дочерних `BsDataUnitNodeLite`-узлов
(например, задавать пустую строку `""` при `depth≥1`, или добавить отдельный признак).

## Ожидаемый эффект

Оценка сокращения размера ответа для типичной фракции (~100 юнитов, ~3 modifierGroups
каждый):

| Поле | Примерный размер |
|------|-----------------|
| `modifierGroups[].id` | ~14 Б × 300 групп ≈ 4 КБ |
| `modifierGroups[].unitId` | ~50 Б × 300 групп ≈ 15 КБ |
| `parentId` на ~300 узлах | ~50 Б × 300 ≈ 15 КБ |
| `catalogueId` на ~250 дочерних | ~50 Б × 250 ≈ 12 КБ |

Итого: **~45 КБ** до сжатия на одну фракцию.

## Приоритет

Средний. Функционал работает корректно, это только оптимизация размера ответа.
