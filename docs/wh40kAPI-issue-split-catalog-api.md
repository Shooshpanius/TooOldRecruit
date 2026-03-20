# Задание для wh40kAPI: разделить каталог на части — лёгкий список и полный датащит

> **Репозиторий:** https://github.com/Shooshpanius/wh40kAPI  
> **Контекст:** оптимизация загрузки каталога в TooOldRecruit — пользователь видит список отрядов
> немедленно, характеристики загружаются при выборе конкретного отряда.

---

## Проблема

Эндпоинт `GET /fractions/{id}/unitsTree` возвращает **всё дерево фракции целиком**, включая:

- характеристики всех юнитов (`profiles[]` с `typeName="Unit"`)
- характеристики всего оружия (`profiles[]` на дочерних `upgrade`-узлах)

Это создаёт большой объём данных, который клиент скачивает **до** отображения списка отрядов.

На примере **Death Guard** (~90 юнитов, ~101 weapon-upgrade):

```
/fractions/{id}/unitsTree → ~N КБ с profiles для 90 юнитов + 101 оружия
```

Пользователь ждёт полной загрузки прежде чем увидеть простой список имён/стоимостей.

---

## Предлагаемое решение: два новых эндпоинта

### Эндпоинт 1: `GET /fractions/{id}/unitsList`

**Лёгкий список отрядов фракции** — то же дерево, что и `/unitsTree`, но **без поля `profiles`**
на любом узле (ни на корневых юнитах, ни на дочерних upgrade-узлах).

Клиент использует этот эндпоинт для мгновенного отображения списка отрядов
(название, категория, стоимость, детачмент-условия, Allied-классификация — всё это
не требует `profiles`).

**Формат ответа:** идентичен `/unitsTree`, но `profiles` отсутствует или равен `[]` на
всех узлах.

```json
{
  "id": "f5ac-4f37-fe7b-36b6",
  "name": "Mortarion",
  "entryType": "model",
  "points": 380,
  "categories": [
    { "name": "Epic Hero", "primary": true },
    { "name": "DEATH GUARD", "primary": false }
  ],
  "infoLinks": [...],
  "modifierGroups": [...],
  "children": [
    {
      "id": "f6e3-ffc-e5ac-8429",
      "name": "Lantern",
      "entryType": "upgrade",
      "infoLinks": [...],
      "profiles": []
    }
  ]
}
```

**Реализация (предложение):**

```csharp
// BsDataFractionsController.cs
[HttpGet("{id}/unitsList")]
public async Task<ActionResult<IEnumerable<BsDataUnitNode>>> GetUnitsTreeLite(string id)
{
    // То же, что GetUnitsTree, но без .Include(u => u.Profiles)
    // и BsDataUnitNode.Profiles = [] (или не заполняется совсем)
}
```

---

### Эндпоинт 2: `GET /units/{id}/fullNode`

**Полный узел отдельного юнита** — возвращает `BsDataUnitNode` с полными данными:
- `profiles` юнита (характеристики M/T/Sv/W/Ld/OC)
- дочерние `upgrade`-узлы (оружие) с их `profiles` и `infoLinks`
- все `categories`, `modifierGroups`, `requiredUpgrades`

Используется клиентом при выборе конкретного отряда в каталоге для отображения
полного датащита (аналог https://wahapedia.ru).

**Формат ответа:** один `BsDataUnitNode` — тот же объект, что и узел в `/unitsTree`, с
полным набором полей.

```json
{
  "id": "f5ac-4f37-fe7b-36b6",
  "name": "Mortarion",
  "entryType": "model",
  "points": 380,
  "categories": [...],
  "profiles": [
    {
      "name": "Mortarion",
      "typeName": "Unit",
      "characteristics": "{\"M\":\"9\\\"\",\"T\":\"14\",\"Sv\":\"2+\",\"W\":\"18\",\"Ld\":\"6+\",\"OC\":\"4\"}"
    }
  ],
  "infoLinks": [...],
  "modifierGroups": [...],
  "children": [
    {
      "id": "f6e3-ffc-e5ac-8429",
      "name": "Lantern",
      "entryType": "upgrade",
      "profiles": [
        {
          "name": "Lantern",
          "typeName": "Ranged Weapons",
          "characteristics": "{\"Range\":\"12\\\"\",\"A\":\"3\",\"BS\":\"2+\",\"S\":\"6\",\"AP\":\"-1\",\"D\":\"2\"}"
        }
      ],
      "infoLinks": [...]
    }
  ]
}
```

**Реализация (предложение):**

```csharp
// BsDataUnitsController.cs
[HttpGet("{id}/fullNode")]
public async Task<ActionResult<BsDataUnitNode>> GetFullNode(string id)
{
    var unit = await db.Units.AsNoTracking()
        .Include(u => u.Categories)
        .Include(u => u.InfoLinks)
        .Include(u => u.EntryLinks)
        .Include(u => u.CostTiers)
        .Include(u => u.ModifierGroups)
        .Include(u => u.Profiles)                       // ← характеристики юнита
        .FirstOrDefaultAsync(u => u.Id == id);
    if (unit is null) return NotFound();

    var node = BsDataUnitNode.FromUnit(unit);

    // Дочерние узлы (по parentId) с их profiles и infoLinks
    var children = await db.Units.AsNoTracking()
        .Include(u => u.InfoLinks)
        .Include(u => u.Profiles)                       // ← характеристики оружия
        .Where(u => u.ParentId == id)
        .ToListAsync();
    foreach (var child in children)
        node.Children.Add(BsDataUnitNode.FromUnit(child));

    return Ok(node);
}
```

---

## Как TooOldRecruit будет использовать новые эндпоинты

### Текущий workaround (пока эндпоинты не реализованы)

TooOldRecruit Server уже реализовал промежуточное решение:

1. `GET /api/bsdata/fractions/{id}/units-list` — прокси к `/unitsTree`, удаляет поле `profiles`
   на стороне TooOldRecruit-сервера через `System.Text.Json.Nodes.JsonNode`.

2. Полные данные загружаются фоном через существующий `/unitsTree`.

После реализации обоих эндпоинтов в wh40kAPI:
- `/units-list` заменится на нативный `/unitsList` (меньше нагрузки на wh40kAPI)
- Фоновая загрузка всего `/unitsTree` заменится на `GET /units/{id}/fullNode` — только для
  выбранного юнита

### Сценарий загрузки в каталоге (после реализации обоих эндпоинтов)

```
Пользователь выбирает фракцию
    ↓
GET /fractions/{id}/unitsList   → ~быстро → показываем список отрядов
    ↓ (пользователь выбирает юнит)
GET /units/{unitId}/fullNode    → ~быстро → показываем полный датащит
```

Вместо текущего:
```
Пользователь выбирает фракцию
    ↓
GET /fractions/{id}/unitsTree   → ~долго → ждём, потом показываем всё сразу
```

---

## Обратная совместимость

| Изменение | Обратная совместимость |
|-----------|----------------------|
| Новый эндпоинт `/unitsList` | ✅ Не влияет на существующий `/unitsTree` |
| Новый эндпоинт `/units/{id}/fullNode` | ✅ Не влияет на существующий `/units/{id}` |
