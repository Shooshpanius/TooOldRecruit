# wh40kAPI Fix: Allied Units for Factions with Non-importRootEntries Library Links

## Проблема

Фракции с единственным богом-покровителем (Death Guard → Nurgle, World Eaters → Khorne,
Thousand Sons → Tzeentch, Emperor's Children → Slaanesh) содержат в разделе Allied Units
демонов ВСЕХ богов, хотя по правилу Daemonic Pact они могут брать в союзники только
демонов своего бога.

### Корневая причина

Эти фракции ссылаются на Daemons Library (`b45c-af22-788a-dfd6`) через `catalogueLink`
**без** атрибута `importRootEntries="true"`:

```xml
<!-- Chaos - Death Guard.cat -->
<catalogueLink type="catalogue" name="Chaos - Daemons Library"
               id="54cd-05de-52f3-45d6" targetId="b45c-af22-788a-dfd6"/>
```

Правило Daemonic Pact кодируется **явными entryLinks** на конкретных демонов своего бога:

```xml
<entryLink import="true" name="Great Unclean One" hidden="false"
           id="0a84-b5f4-bc9e-6779" type="selectionEntry" targetId="2425-13a7-77f0-0112"/>
<entryLink import="true" name="Plaguebearers" hidden="false"
           id="1269-0678-4365-6471" type="selectionEntry" targetId="904b-0319-7b2e-2145"/>
...
```

Тем не менее, `CollectCatalogueIdsAsync` включает библиотеку демонов в полный список каталогов
за счёт fallback `library=true`:

```csharp
// BsDataFractionsController.cs — CollectCatalogueIdsAsync
var libraryCatalogueIds = importRootEntriesOnly
    ? (await db.Catalogues.AsNoTracking()
        .Where(c => c.Library)
        .Select(c => c.Id)
        .ToListAsync())
        .ToHashSet(StringComparer.OrdinalIgnoreCase)
    : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

var linkMap = allLinks
    .Where(l => !importRootEntriesOnly || l.ImportRootEntries || libraryCatalogueIds.Contains(l.TargetId))
    ...
```

В результате `GetUnitsTreeLite` (и другие endpoints) возвращают **все** юниты из Daemons
Library, включая демонов Khorne, Tzeentch, Slaanesh — которых Death Guard использовать
не должна.

## Решение в wh40kAPI

### Шаг 1: Добавить метод `CollectStrictImportRootEntriesIdsAsync`

Этот метод следует **только** по ссылкам с `importRootEntries="true"`, без fallback
для библиотечных каталогов:

```csharp
/// <summary>
/// Collects the set of catalogue IDs reachable from <paramref name="rootId"/> by following
/// ONLY catalogue links where <c>importRootEntries=true</c>.
/// Unlike <see cref="CollectCatalogueIdsAsync(string, bool)"/> with
/// <c>importRootEntriesOnly=true</c>, this method does NOT apply the library-type
/// fallback — library catalogues reached only through non-importRootEntries links
/// (e.g. the Daemons Library linked from Death Guard) are excluded.
/// </summary>
private async Task<HashSet<string>> CollectStrictImportRootEntriesIdsAsync(string rootId)
{
    var allLinks = await db.CatalogueLinks.AsNoTracking()
        .Select(l => new { l.CatalogueId, l.TargetId, l.ImportRootEntries })
        .ToListAsync();

    var linkMap = allLinks
        .Where(l => l.ImportRootEntries)
        .GroupBy(l => l.CatalogueId, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.Select(l => l.TargetId).ToList(),
                      StringComparer.OrdinalIgnoreCase);

    var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { rootId };
    var queue = new Queue<string>();
    queue.Enqueue(rootId);

    while (queue.Count > 0)
    {
        var current = queue.Dequeue();
        if (!linkMap.TryGetValue(current, out var linkedIds)) continue;
        foreach (var targetId in linkedIds)
            if (visited.Add(targetId)) queue.Enqueue(targetId);
    }
    return visited;
}
```

### Шаг 2: Добавить метод фильтрации юнитов `FilterNonImportLibraryUnitsAsync`

```csharp
/// <summary>
/// Filters <paramref name="units"/> to exclude units from library catalogues that are
/// only reachable via non-importRootEntries links (e.g. the Daemons Library for Death Guard).
/// For such catalogues, only units explicitly listed in <c>CatalogueLevelEntryLinks</c>
/// from the strict import-root-entries catalogue set (plus their descendants by parentId)
/// are retained.
/// Returns the original list unchanged when no non-import library catalogues are present.
/// </summary>
private async Task<List<BsDataUnit>> FilterNonImportLibraryUnitsAsync(
    string factionId,
    HashSet<string> allCatalogueIds,
    List<BsDataUnit> units)
{
    var strictIds = await CollectStrictImportRootEntriesIdsAsync(factionId);
    var nonImportLibraryIds = allCatalogueIds
        .Where(cid => !strictIds.Contains(cid))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    if (nonImportLibraryIds.Count == 0)
        return units;

    // Units explicitly linked via catalogue-level entryLinks from the strict-import chain
    var directlyAllowedTargets = await db.CatalogueLevelEntryLinks.AsNoTracking()
        .Where(l => strictIds.Contains(l.CatalogueId))
        .Select(l => l.TargetId)
        .ToListAsync();

    // Expand to include descendants (children by parentId) of directly allowed units
    var expandedAllowed = directlyAllowedTargets.ToHashSet(StringComparer.OrdinalIgnoreCase);
    bool changed;
    do
    {
        changed = false;
        foreach (var unit in units)
        {
            if (nonImportLibraryIds.Contains(unit.CatalogueId)
                && !expandedAllowed.Contains(unit.Id)
                && unit.ParentId is not null
                && expandedAllowed.Contains(unit.ParentId))
            {
                expandedAllowed.Add(unit.Id);
                changed = true;
            }
        }
    } while (changed);

    return units
        .Where(u => !nonImportLibraryIds.Contains(u.CatalogueId) || expandedAllowed.Contains(u.Id))
        .ToList();
}
```

### Шаг 3: Применить фильтрацию в `GetUnitsTreeLite`

```csharp
[HttpGet("{id}/unitsList")]
public async Task<ActionResult<IEnumerable<BsDataUnitNodeLite>>> GetUnitsTreeLite(string id)
{
    if (!await db.Catalogues.AnyAsync(c => c.Id == id && !c.Library))
        return NotFound();

    var catalogueIds = await CollectCatalogueIdsAsync(id);

    var units = await db.Units.AsNoTracking()
        .Where(u => catalogueIds.Contains(u.CatalogueId))
        .Include(u => u.Categories)
        .Include(u => u.ModifierGroups)
        .OrderBy(u => u.Name)
        .ToListAsync();

    // Filter out units from library catalogues linked without importRootEntries
    // (e.g. non-Nurgle daemons from Daemons Library for Death Guard)
    units = await FilterNonImportLibraryUnitsAsync(id, catalogueIds, units);

    // ... rest of the method unchanged ...
}
```

### Шаг 4: Применить фильтрацию в `BuildUnitsTreeAsync`

Изменить сигнатуру и добавить параметры фильтрации:

```csharp
private async Task<List<BsDataUnitNode>> BuildUnitsTreeAsync(
    string factionId,           // <-- добавить
    HashSet<string> catalogueIds,
    bool includeProfiles)
{
    var units = await db.Units.AsNoTracking()
        .Where(u => catalogueIds.Contains(u.CatalogueId))
        // ... includes ...
        .ToListAsync();

    // Filter non-import library units
    units = await FilterNonImportLibraryUnitsAsync(factionId, catalogueIds, units);

    // ... rest unchanged ...
}
```

Обновить все вызовы `BuildUnitsTreeAsync`, передав `id`:
```csharp
return Ok(await BuildUnitsTreeAsync(id, catalogueIds, includeProfiles: true));
```

### Шаг 5: Применить фильтрацию в `GetUnitsClassification`

```csharp
[HttpGet("{id}/units-classification")]
public async Task<ActionResult<IEnumerable<BsDataUnitClassification>>> GetUnitsClassification(string id)
{
    // ...
    var units = await db.Units.AsNoTracking()
        .Where(u => catalogueIds.Contains(u.CatalogueId))
        .Include(u => u.Categories)
        .OrderBy(u => u.Name)
        .ToListAsync();

    units = await FilterNonImportLibraryUnitsAsync(id, catalogueIds, units);

    return Ok(units.Select(BsDataUnitClassification.FromUnit));
}
```

## Фракции, затронутые исправлением

| Фракция             | catalogueLink к Daemons Library | Демоны в Allied после исправления |
|---------------------|---------------------------------|-----------------------------------|
| Chaos - Death Guard | без importRootEntries            | Только Nurgle (Plaguebearers, GUO, Nurglings, Beasts of Nurgle, Plague Drones, Rotigus) |
| Chaos - World Eaters | без importRootEntries           | Только Khorne (Bloodletters, Bloodthirster, Flesh Hounds, Bloodcrushers, Skarbrand) |
| Chaos - Thousand Sons | без importRootEntries          | Только Tzeentch (Pink Horrors, Blue Horrors, Flamers, Screamers, Lord of Change, Kairos) |
| Chaos - Emperor's Children | без importRootEntries     | Только Slaanesh (Daemonettes, Seekers, Fiends, Keeper of Secrets, etc.) |
| Chaos - Chaos Space Marines | с importRootEntries=true | Все демоны как own (не Allied) — без изменений |
| Chaos - Chaos Knights | с importRootEntries=true    | Все демоны как own (не Allied) — без изменений |

## Временное решение в TooOldRecruit

Пока wh40kAPI не обновлён, в `api.ts` реализована аппроксимирующая фильтрация
на основе категорий бога-покровителя (`collectUnits` → patron god filter).

**Ограничение:** undivided-демоны (Soul Grinder, Be'lakor, Daemon Prince of Chaos)
могут отображаться для single-god фракций, т.к. у них нет категории конкретного бога.
После применения исправления wh40kAPI эта фильтрация в api.ts станет избыточной
(можно будет убрать) — данные из API уже будут корректными.
