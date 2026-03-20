# Задание для wh40kAPI: дополнительно облегчить `/fractions/{id}/unitsList`

> **Репозиторий:** https://github.com/Shooshpanius/wh40kAPI  
> **Контекст:** дальнейшая оптимизация каталога в TooOldRecruit — устранение лишней нагрузки
> на БД wh40kAPI и сетевого трафика между wh40kAPI и TooOldRecruit.
>
> **Статус: ⏳ Не реализовано**  
> До реализации TooOldRecruit стрипует лишние поля на своей стороне через JSON-парсинг
> (`BsdataController.StripUnitsListJson`).

---

## Проблема

Эндпоинт `GET /fractions/{id}/unitsList` (реализован в Shooshpanius/wh40kAPI@59348c7) уже не
возвращает `profiles`, но всё ещё включает поля, которые **не нужны** для отображения
списка отрядов в каталоге:

| Поле | Узлы | Почему не нужно в `/unitsList` |
|------|------|-------------------------------|
| `infoLinks[].id` | корневые (depth=0) | клиент читает только `type` и `name` |
| `infoLinks[].targetId` | корневые (depth=0) | клиент читает только `type` и `name` |
| `infoLinks` (целиком) | дочерние (depth≥1) | ключевые слова оружия — только в fullNode |
| `categories` | дочерние (depth≥1) | состав отряда в каталоге категорий не показывает |
| `unitCategories` | дочерние (depth≥1) | то же |

> **Корневые узлы** — это записи типа `unit` / `model` на верхнем уровне дерева (depth=0),
> то есть сами отряды.  
> **Дочерние узлы** — вложенные записи типа `model` / `upgrade` / `selectionEntryGroup`,
> составляющие отряд (depth≥1).

### Что нужно клиенту от `/unitsList`

**Корневые узлы (depth=0):**

| Поле | Зачем |
|------|-------|
| `id` | идентификатор отряда |
| `name` | отображение в списке |
| `entryType` | определение unit/model |
| `categories` | первичная категория (primary=true) + ключевые слова (primary=false) |
| `points` / `costTiers` | стоимость в списке |
| `maxInRoster`, `minInRoster` | ограничения ростера |
| `hidden` | логика показа/скрытия |
| `modifierGroups` | изменение категории/лимитов через детачмент |
| `catalogueId` | определение Allied Units |
| `requiredUpgrades` | War Dog и аналогичные — min в ростере |
| `infoLinks[].type`, `infoLinks[].name` | флаг Leader; названия способностей |
| `children` | состав отряда (дочерние модели) |

**Дочерние узлы (depth≥1):**

| Поле | Зачем |
|------|-------|
| `id` | идентификатор модели/апгрейда |
| `name` | отображение в составе отряда |
| `entryType` | определение model/upgrade/container |
| `hidden` | логика показа/скрытия |
| `modifierGroups` | XOR-взаимоисключение моделей, детачмент-условия |
| `minInRoster`, `maxInRoster` | min/max количество моделей |
| `costTiers` | наследование диапазонов стоимости от родительского [U] |
| `children` | вложенные контейнеры |

---

## Предлагаемое решение

### Изменения в wh40kAPI

1. **Не загружать `InfoLinks` для дочерних узлов** в запросе `/unitsList`:

```csharp
// BsDataFractionsController.cs — метод GetUnitsTreeLite (или как он называется в текущей реализации /unitsList)

// Корневые узлы: загружать InfoLinks, но сериализовать только {type, name}
var roots = await db.Units.AsNoTracking()
    .Where(u => u.FractionId == id && u.ParentId == null)
    .Include(u => u.Categories)
    .Include(u => u.InfoLinks)      // ← нужны, но только type+name
    .Include(u => u.CostTiers)
    .Include(u => u.ModifierGroups)
    .Include(u => u.RequiredUpgrades)
    // Profiles НЕ загружаем (уже было)
    .ToListAsync();

// Дочерние узлы: InfoLinks и Categories НЕ загружаем вообще
var children = await db.Units.AsNoTracking()
    .Where(u => u.FractionId == id && u.ParentId != null)
    .Include(u => u.CostTiers)
    .Include(u => u.ModifierGroups)
    // InfoLinks НЕ загружаем
    // Categories НЕ загружаем
    // Profiles НЕ загружаем
    .ToListAsync();
```

2. **Использовать облегчённый DTO для сериализации** — только нужные поля:

```csharp
// Вариант А: новый DTO BsDataUnitNodeLite с аннотацией [JsonIgnore] на лишних полях.

// Вариант Б: сериализовать через анонимный тип / проекцию Select() в памяти.
// Пример для корневых узлов:
var rootNodes = roots.Select(u => new
{
    u.Id, u.Name, u.EntryType, u.Points, u.MaxInRoster, u.MinInRoster,
    u.Hidden, u.CatalogueId, u.ParentId,
    Categories    = u.Categories,
    CostTiers     = u.CostTiers,
    ModifierGroups = u.ModifierGroups,
    RequiredUpgrades = u.RequiredUpgrades,
    // InfoLinks: только type и name
    InfoLinks = u.InfoLinks.Select(l => new { l.Type, l.Name }),
    Children  = /* дочерние узлы без infoLinks и categories */
});
```

3. **Вернуть плоский список** или построить дерево — как и сейчас, просто с меньшим набором полей.

---

## Эффект

| Метрика | До (текущий `/unitsList`) | После |
|---------|--------------------------|-------|
| DB JOIN | Categories + InfoLinks на всех узлах | InfoLinks/Categories только на корневых |
| Поля на дочернем узле | id, name, entryType, infoLinks[], categories[], modifierGroups, ... | id, name, entryType, modifierGroups, min/max, costTiers |
| Постобработка в TooOldRecruit | JSON-парсинг + стрипинг (`StripUnitsListJson`) | Не нужна — можно удалить |

Для фракции с ~100 юнитами и ~10 дочерними узлами на каждом это около **1000 дочерних узлов**,
у каждого из которых убирается `infoLinks` (~3 объекта) и `categories` (~2 объекта) — итого
~5000 лишних объектов исчезают из ответа без всяких затрат на клиентской стороне.

---

## Изменения в TooOldRecruit после реализации

После того как wh40kAPI нативно вернёт нужный формат, из `BsdataController.cs` можно удалить:

- Метод `StripUnitsListJson`
- Метод `StripUnitsListNode`
- Метод `StripInfoLinkFields`
- Вызов `StripUnitsListJson` в `GetFractionUnitsList`
- `using System.Text.Json.Nodes;` и `using System.Text.Json;` (если не используются в других местах)

`GetFractionUnitsList` упростится до обычного прокси-вызова.

---

## Обратная совместимость

Изменение затрагивает только `/unitsList` — эндпоинт, реализованный в @59348c7,
у которого единственный известный клиент — TooOldRecruit.
Существующие `/unitsTree` и `/units/{id}/fullNode` не затрагиваются.

Так как убираемые поля (`infoLinks`, `categories` на дочерних узлах и `id`/`targetId`
в `infoLinks` корневых узлов) никогда не использовались клиентом при работе с `/unitsList`,
убрать их нативно — обратно совместимое сужение ответа.
