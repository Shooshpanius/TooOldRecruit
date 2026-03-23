# Задача для wh40kAPI: включить `requiredUpgrades` в ответ `/unitsList`

## Статус

**Закрыта.** Поле `RequiredUpgrades` добавлено в `BsDataUnitNodeLite` в wh40kAPI.
Клиент TooOldRecruit читает его автоматически через `ApiUnitItem.requiredUpgrades`
в `mapItem()` — изменений на стороне TooOldRecruit не потребовалось.

---

## Проблема

Поле `requiredUpgrades` присутствует в ответе `/fractions/{id}/unitsTree`, но
отсутствует в `/fractions/{id}/unitsList` (`BsDataUnitNodeLite`).

Клиент TooOldRecruit читает `requiredUpgrades` в `mapItem()` (при `isTopLevel`,
т.е. `depth=0`) для установки `minInRoster` у юнитов типа `model`:

```typescript
// my40kroster.client/src/services/api.ts, mapItem(), ~строка 880
if (detachmentId && item.requiredUpgrades?.length) {
  const matchingUpgrade = item.requiredUpgrades.find(
    u => u.requiredDetachmentId === detachmentId
  );
  if (matchingUpgrade?.minInRoster != null) {
    const reqMin = Number(matchingUpgrade.minInRoster);
    if (isFinite(reqMin) && reqMin > 0) {
      minInRoster = Math.max(minInRoster ?? 0, reqMin);
    }
  }
}
```

Без этого поля в `unitsList` клиент не может вычислить `minInRoster` для
затронутых юнитов при загрузке из лёгкого эндпоинта, и минимальное ограничение
не отображается в пикере добавления отряда.

---

## Почему альтернативный путь через `children` не помогает

В `mapItem()` есть второй путь — извлечение детачмент-апгрейдов из `children`:

```typescript
// ~строка 901
item.children
  .filter(child =>
    child.entryType === 'upgrade' &&
    child.hidden !== true &&              // ← проблема здесь
    getRequiredDetachmentId(child) === detachmentId
  )
```

Upgrade-дочерние записи у War Dog имеют **`hidden: true` по умолчанию** (скрыты
в BSData, пока не выбран нужный детачмент). Из-за фильтра `child.hidden !== true`
они пропускаются, и `minInRoster` не вычисляется.

`requiredUpgrades` в ответе wh40kAPI — это заранее вычисленная агрегация именно
для таких случаев, когда `buildChildTree` не обрабатывает upgrade-детей
`model`-записи.

---

## Затронутые юниты

На данный момент только **Chaos Knights**, детачмент **Houndpack Lance**:

| Юнит | requiredUpgrade | minInRoster | maxInRoster |
|------|----------------|-------------|-------------|
| War Dog Brigand | Houndpack Lance Character | 3 | 3 |
| War Dog Executioner | Houndpack Lance Character | 3 | 3 |
| War Dog Huntsman | Houndpack Lance Character | 3 | 3 |
| War Dog Karnivore | Houndpack Lance Character | 3 | 3 |
| War Dog Moirax | Houndpack Lance Character | 3 | 3 |
| War Dog Stalker | Houndpack Lance Character | 3 | 3 |
| War Dog Domination | Houndpack Lance Character | 3 | 3 |

Итого: **7 корневых узлов** × **1 запись** `requiredUpgrade` каждый.

---

## Ожидаемый прирост размера `/unitsList`

Структура одной записи `requiredUpgrade`:

```json
{
  "id": "f2e5-c3a1-7b8d-4e90",
  "name": "Houndpack Lance Character",
  "minInRoster": 3,
  "maxInRoster": 3,
  "requiredDetachmentId": "6cb5-45cf-c626-fa86"
}
```

Примерный размер одной записи: **~170 байт** (без форматирования).

| Величина | Значение |
|----------|----------|
| Затронутых юнитов | 7 (только CK) |
| Записей `requiredUpgrade` | 7 |
| Прирост на фракцию CK | **~1.2 КБ** |
| Прирост в % от ответа CK (~1.3 МБ) | **<0.1%** |

Влияние на размер **незначимо**.

---

## Что нужно сделать в wh40kAPI

Добавить поле `RequiredUpgrades` в `BsDataUnitNodeLite` (DTO для `/unitsList`) —
аналогично тому, как оно уже присутствует в `BsDataUnitNode` (DTO для `/unitsTree`,
добавлено в коммите
[`e28e595`](https://github.com/Shooshpanius/wh40kAPI/commit/e28e595346767764c9d0d57bf0956c69b1047afc)).

```csharp
// BsDataUnitNodeLite
public ICollection<BsDataRequiredUpgrade>? RequiredUpgrades { get; set; }
```

Заполнение — та же логика, что и для `unitsTree`: только для корневых узлов
(`depth=0`), только для записей типа `model`, у которых upgrade-дети имеют
`minInRoster > 0` и условие скрытия по детачменту.

---

## Приоритет

Низкий. Функционал работает корректно при загрузке через `/unitsTree`. Проблема
проявляется только в лёгком режиме (`/unitsList`), где `minInRoster` для War Dog
не будет установлен при выборе Houndpack Lance. Прирост размера ответа
пренебрежимо мал.
