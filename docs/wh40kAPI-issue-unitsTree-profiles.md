# Задание для wh40kAPI: обогащение `/fractions/{id}/unitsTree` данными для отображения карточек юнитов

> **Репозиторий:** https://github.com/Shooshpanius/wh40kAPI  
> **Контекст:** необходимо для реализации полноценного каталога юнитов в TooOldRecruit (аналог Wahapedia)

---

## Проблема

Для отображения полноценной карточки юнита в каталоге (аналогично https://wahapedia.ru/wh40k10ed/factions/death-guard/datasheets.html) необходимы три группы данных, которых **нет** в текущем ответе `GET /api/bsdata/fractions/{id}/unitsTree`:

| Данные | Источник в БД | Текущий статус |
|--------|--------------|----------------|
| Характеристики юнита (M/T/Sv/W/Ld/OC) | `BsDataProfile` (TypeName = "Unit") | ❌ не возвращаются |
| Характеристики оружия (Range/A/BS\|WS/S/AP/D) | `BsDataProfile` (TypeName содержит "Weapons") | ❌ не возвращаются |
| Все ключевые слова (FACTION, KEYWORD, …) | `BsDataUnitCategory` (все записи, не только `primary`) | ❌ только primary категория |
| Имена способностей юнита | `BsDataInfoLink` (type = "rule") | ✅ уже есть в `infoLinks` |
| Оружие (дочерние upgrade-записи) с ключевыми словами | `BsDataUnit` + `BsDataInfoLink` | ⚠️ children содержат upgrade-узлы, но без `profiles` |

### Сколько вызовов API нужно сейчас для отображения каталога одной фракции

На примере **Death Guard** (90 юнитов, 101 дочерний upgrade-узел-оружие):

```
  1 вызов   — /fractions/{id}/unitsTree   (список юнитов)
 90 вызовов — /units/{id}/profiles        (характеристики каждого юнита)
101 вызов   — /units/{id}/profiles        (характеристики каждого оружия)
 90 вызовов — /units/{id}/categories      (все ключевые слова каждого юнита)
─────────────────────────────────────────────────────────────────────────────
282 вызова для одной фракции — неприемлемо
```

---

## Предлагаемое решение: обогатить `/fractions/{id}/unitsTree`

### Изменение 1 — возвращать все категории, а не только primary

**Файл:** `wh40kAPI.Server/Controllers/BsDataFractionsController.cs`

```csharp
// Было
.Include(u => u.Categories.Where(c => c.Primary))

// Стало
.Include(u => u.Categories)
```

Это позволит видеть полный список ключевых слов юнита (например, `DEATH GUARD`, `NURGLE`, `PSYKER`, `MONSTER` у Мортариона), а не только боевую роль (`Epic Hero`).

---

### Изменение 2 — добавить профили (характеристики) к каждому узлу дерева

**Шаг 2а.** Добавить навигационное свойство в `BsDataUnit`:

```csharp
// wh40kAPI.Server/Models/BsData/BsDataUnit.cs
public ICollection<BsDataProfile> Profiles { get; set; } = [];
```

**Шаг 2б.** В `BsDataDbContext.OnModelCreating` — обновить FK-конфигурацию (сейчас FK есть, но `WithMany` не указывает навигационное свойство на стороне Unit):

```csharp
// wh40kAPI.Server/Data/BsDataDbContext.cs
modelBuilder.Entity<BsDataProfile>()
    .HasOne<BsDataUnit>()
    .WithMany(u => u.Profiles)   // ← добавить навигационное свойство
    .HasForeignKey(p => p.UnitId)
    .OnDelete(DeleteBehavior.Cascade);
```

**Шаг 2в.** В `GetUnitsTree()` добавить Include:

```csharp
// wh40kAPI.Server/Controllers/BsDataFractionsController.cs
var units = await db.Units.AsNoTracking()
    .Include(u => u.Categories)              // ← все категории (изменение 1)
    .Include(u => u.InfoLinks)
    .Include(u => u.EntryLinks)
    .Include(u => u.CostTiers)
    .Include(u => u.ModifierGroups)
    .Include(u => u.Profiles)               // ← добавить профили
    .Where(u => catalogueIds.Contains(u.CatalogueId))
    .OrderBy(u => u.Name)
    .ToListAsync();
```

**Шаг 2г.** Добавить поле в `BsDataUnitNode`:

```csharp
// wh40kAPI.Server/Models/BsData/BsDataUnitNode.cs

/// <summary>BSData profiles: unit stats (TypeName="Unit") or weapon stats (TypeName contains "Weapons").</summary>
public ICollection<BsDataProfile> Profiles { get; set; } = [];
```

И заполнять в `FromUnit()`:

```csharp
Profiles = unit.Profiles,
```

---

### Изменение 3 — убедиться, что upgrade-дочерние узлы (оружие) передаются с профилями

Оружие юнитов в BSData — это дочерние `<selectionEntry type="upgrade">` с:
- собственными `infoLinks` типа `rule` → ключевые слова оружия (Lethal Hits, Blast, и т.д.)
- собственными профилями → характеристики оружия (Range, A, BS/WS, S, AP, D)

В текущем `/unitsTree` дочерние `upgrade`-узлы уже попадают в `Children` через механизм `parentId`. После добавления `Include(u => u.Profiles)` (изменение 2) их профили также будут загружены автоматически, поскольку они тоже являются записями `BsDataUnit`.

**Проверить:** дочерние upgrade-узлы (оружие) содержат в своём `profiles` записи с `typeName` равным, например, `"Ranged Weapons"` или `"Melee Weapons"`, и непустым `characteristics`.

---

## Ожидаемый формат ответа

После изменений каждый узел `BsDataUnitNode` в `/unitsTree` будет выглядеть примерно так:

```json
{
  "id": "f5ac-4f37-fe7b-36b6",
  "name": "Mortarion",
  "entryType": "model",
  "points": 380,
  "categories": [
    { "name": "Epic Hero",   "primary": true  },
    { "name": "DEATH GUARD", "primary": false },
    { "name": "MONSTER",     "primary": false },
    { "name": "NURGLE",      "primary": false },
    { "name": "PSYKER",      "primary": false },
    { "name": "PRIMARCH",    "primary": false }
  ],
  "profiles": [
    {
      "id": "...",
      "name": "Mortarion",
      "typeName": "Unit",
      "characteristics": "{\"M\":\"9\\\"\",\"T\":\"14\",\"Sv\":\"2+\",\"W\":\"18\",\"Ld\":\"6+\",\"OC\":\"4\"}"
    }
  ],
  "infoLinks": [
    { "name": "Feel No Pain",         "type": "rule", "targetId": "..." },
    { "name": "Deadly Demise",        "type": "rule", "targetId": "..." },
    { "name": "Deep Strike",          "type": "rule", "targetId": "..." },
    { "name": "Nurgle's Gift (Aura)", "type": "rule", "targetId": "..." }
  ],
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
      "infoLinks": [
        { "name": "Sustained Hits", "type": "rule", "targetId": "..." },
        { "name": "Pistol",         "type": "rule", "targetId": "..." }
      ]
    },
    {
      "id": "d128-8e94-6080-6e01",
      "name": "Rotwind",
      "entryType": "upgrade",
      "profiles": [
        {
          "name": "Rotwind",
          "typeName": "Ranged Weapons",
          "characteristics": "{\"Range\":\"18\\\"\",\"A\":\"D6\",\"BS\":\"2+\",\"S\":\"6\",\"AP\":\"-2\",\"D\":\"D3\"}"
        }
      ],
      "infoLinks": [
        { "name": "Psychic",            "type": "rule", "targetId": "..." },
        { "name": "Lethal Hits",        "type": "rule", "targetId": "..." },
        { "name": "Blast",              "type": "rule", "targetId": "..." },
        { "name": "Devastating Wounds", "type": "rule", "targetId": "..." }
      ]
    },
    {
      "id": "dc1c-9a40-4bee-7f57",
      "name": "Silence",
      "entryType": "upgrade",
      "profiles": [
        {
          "name": "Silence",
          "typeName": "Melee Weapons",
          "characteristics": "{\"Range\":\"Melee\",\"A\":\"6\",\"WS\":\"2+\",\"S\":\"14\",\"AP\":\"-3\",\"D\":\"3\"}"
        }
      ],
      "infoLinks": [
        { "name": "Lethal Hits",        "type": "rule", "targetId": "..." },
        { "name": "Devastating Wounds", "type": "rule", "targetId": "..." },
        { "name": "Sustained Hits",     "type": "rule", "targetId": "..." }
      ]
    }
  ]
}
```

---

## Как TooOldRecruit будет использовать эти данные

Страница каталога будет отображать для выбранного юнита:

1. **Таблица характеристик** — из `profiles` где `typeName === "Unit"`:  
   `M | T | Sv | InvSv | W | Ld | OC`

2. **Таблицы оружия** — из `children` где `entryType === "upgrade"` и `profiles` содержат профиль с `typeName` включающим `"Weapons"`:  
   `Название | Range | A | BS/WS | S | AP | D | Ключевые слова`  
   *(ключевые слова = `infoLinks[].name` типа `"rule"` из дочернего upgrade-узла)*

3. **Способности** — из `infoLinks[].name` где `type === "rule"` на уровне юнита

4. **Ключевые слова** — из `categories` где `primary === false`

---

## Обратная совместимость

| Изменение | Обратная совместимость |
|-----------|----------------------|
| Новое поле `profiles: []` в узлах дерева | ✅ Старые клиенты игнорируют неизвестные поля |
| Все категории вместо только primary | ✅ Клиенты фильтруют по `primary: true` самостоятельно |
| Дочерние upgrade-узлы уже были в `children` | ✅ Поведение не меняется, просто теперь с `profiles` |
