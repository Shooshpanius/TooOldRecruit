# Задание для wh40kAPI: поддержка опции "Houndpack Lance Character" и minInRoster

## Статус

- ✅ **Данные в API уже частично есть** — `modifierGroups` для War Dog содержат условные изменения
  `maxInRoster` и категории при выборе Houndpack Lance.
- ✅ **Данные в API уже есть** — дочерняя запись "Houndpack Lance Character" с `minInRoster=3`,
  `maxInRoster=3` и модификатором скрытия без Houndpack Lance экспортируется в `/unitsTree`.
- ✅ **Фронтенд обновлён** — добавлена функция `isHiddenByDetachment()`, поле `minInRoster` в `Unit`,
  поддержка в `applyDetachmentModifiers` и `buildChildTree`.
- ❌ **Ограничение** — юниты War Dog имеют `entryType: "model"` (а не `"unit"`), поэтому их дочерние
  узлы (включая "Houndpack Lance Character") не обрабатываются в `buildChildTree` фронтенда.
- ❌ **Отсутствует** — прямой модификатор `minInRoster=3` для юнитов War Dog (per-unit, не per-upgrade).
- ❌ **Отсутствует** — способ отличить min-ограничение от max-ограничения в `modifierGroups`.

---

## Контекст

В детачменте **Houndpack Lance** (`6cb5-45cf-c626-fa86`) фракции **Chaos - Chaos Knights**:

1. Все типы War Dog (`entryType: "model"`) становятся **Battleline** и получают `maxInRoster=6`.
2. Правило игры требует минимум **3 War Dog в ростере суммарно** (не per-type).
3. Ровно **3 из них должны иметь опцию "Houndpack Lance Character"** (roster-wide min=3, max=3).

### Что уже в API

Для каждого типа War Dog (Brigand, Executioner, Huntsman, Karnivore, Moirax, Stalker):

```json
{
  "id": "e96b-ac98-7fd2-a155",
  "name": "War Dog Karnivore",
  "entryType": "model",
  "maxInRoster": 3,
  "minInRoster": null,
  "modifierGroups": [
    {
      "modifiers": "[{\"field\":\"category\",\"type\":\"set-primary\",\"value\":\"e338-111e-d0c6-b687\"}]",
      "conditions": "[{\"scope\":\"roster\",\"type\":\"atLeast\",\"value\":\"1\",\"childId\":\"6cb5-45cf-c626-fa86\"}]"
    },
    {
      "modifiers": "[{\"field\":\"1df3-61b3-1a11-0900\",\"type\":\"set\",\"value\":\"6\"}]",
      "conditions": "[{\"scope\":\"force\",\"type\":\"atLeast\",\"value\":\"1\",\"childId\":\"6cb5-45cf-c626-fa86\"}]"
    }
  ],
  "children": [
    {
      "id": "b02a-a6e2-3eb4-4872",
      "name": "Houndpack Lance Character",
      "entryType": "upgrade",
      "hidden": false,
      "minInRoster": 3,
      "maxInRoster": 3,
      "modifierGroups": [
        {
          "modifiers": "[{\"field\":\"hidden\",\"type\":\"set\",\"value\":\"true\"}]",
          "conditions": "[{\"scope\":\"roster\",\"type\":\"lessThan\",\"value\":\"1\",\"childId\":\"6cb5-45cf-c626-fa86\"}]"
        }
      ]
    }
  ]
}
```

### Проблема 1: War Dog имеют `entryType: "model"`, а не `"unit"`

Фронтенд вызывает `buildChildTree` только для `entryType === "unit"`. Поэтому дочерние записи
`model`-типа никогда не обрабатываются, и опция "Houndpack Lance Character" никогда не показывается.

**Вариант решения на стороне API:**

Если возможно, wh40kAPI мог бы дополнительно экспортировать поле `requiredUpgrades` для юнитов,
у которых есть upgrade-дочерние записи с `minInRoster > 0` и детачмент-условиями:

```json
{
  "id": "e96b-ac98-7fd2-a155",
  "name": "War Dog Karnivore",
  "entryType": "model",
  "requiredUpgrades": [
    {
      "id": "b02a-a6e2-3eb4-4872",
      "name": "Houndpack Lance Character",
      "minInRoster": 3,
      "maxInRoster": 3,
      "requiredDetachmentId": "6cb5-45cf-c626-fa86"
    }
  ]
}
```

Это позволит фронтенду показывать информацию о требуемых опциях детачмента без изменения
существующей архитектуры обработки `unit` vs `model` типов.

### Проблема 2: min-ограничение неотличимо от max-ограничения в modifierGroups

Сейчас в `modifierGroups` все изменения ограничений BSData имеют тип `"set"` с полем = GUID
ограничения. Фронтенд не может определить, является ли данное ограничение минимальным или
максимальным.

**Требование:**

При экспорте modifierGroups, если модификатор изменяет ограничение (constraint), указывать
тип: `"set-max"` для максимума и `"set-min"` для минимума вместо просто `"set"`.

Пример желаемого формата:

```json
{
  "modifiers": "[{\"field\":\"1df3-61b3-1a11-0900\",\"type\":\"set-max\",\"value\":\"6\"},{\"field\":\"GUID-min-constraint\",\"type\":\"set-min\",\"value\":\"3\"}]",
  "conditions": "[{\"scope\":\"force\",\"type\":\"atLeast\",\"value\":\"1\",\"childId\":\"6cb5-45cf-c626-fa86\"}]"
}
```

Это позволит фронтенду правильно определять `minInRoster` наравне с `maxInRoster` при наличии
данных в API, без статических fallback-таблиц.

### Проблема 3: minInRoster для War Dog на уровне юнита

Правило Houndpack Lance требует минимум 3 War Dog **суммарно** в ростере. В BSData это
реализовано через `minInRoster=3` опции "Houndpack Lance Character" (а не через прямое
ограничение на War Dog selectionEntry).

**Вариант решения:** Если в BSData добавится или уже существует прямой min-constraint на
War Dog selectionEntry при Houndpack Lance — пожалуйста, экспортируйте его как `"set-min"` в
modifierGroups (см. Проблему 2).

---

## Похожие случаи в других фракциях

Паттерн "upgrade-опция с detachment-условием и min/max constraints" является общим для BSData.
Следует также проверить аналогичные случаи в других фракциях при реализации `requiredUpgrades`.

---

## Приоритеты

1. **Высокий**: Отличать `set-min` от `set-max` в modifierGroups — это общее улучшение API.
2. **Средний**: Добавить `requiredUpgrades` поле для юнитов с детачмент-зависимыми upgrade-опциями.
3. **Низкий**: Прямой min-constraint для War Dog при Houndpack Lance (если существует в BSData).
