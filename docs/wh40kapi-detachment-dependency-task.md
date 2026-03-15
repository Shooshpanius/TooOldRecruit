# Задание для wh40kAPI: поддержка зависимости юнитов от выбранного детачмента

## Статус

- ✅ **Фронтенд TooOldRecruit готов** — логика фильтрации реализована и ждёт данных от API.
- ✅ **`/fractions/{id}/detachments` возвращает `{id, name}[]`** — фронтенд поддерживает формат.
- ❌ **`/fractions/{id}/unitsTree` не передаёт зависимости от детачмента** — нужно исправить.

---

## Где это закодировано в BSData

Зависимость юнитов от детачмента описана в каталоге **`Chaos - Chaos Knights.cat`** через элементы `<entryLink>`.

### Ключевое: это `<entryLink>`, а не `<selectionEntry>`

Каждый Iconoclast-only юнит представлен как **`<entryLink>`** в каталоге `Chaos - Chaos Knights.cat`, который ссылается на определение юнита (`<selectionEntry>`) в другом каталоге (CSM Library, Chaos Daemons и т.д.). Именно на `<entryLink>` навешены условные модификаторы скрытия — на сам `<selectionEntry>` они не влияют.

### XML-структура зависимости (пример — Cultist Firebrand)

```xml
<!-- Файл: Chaos - Chaos Knights.cat -->
<entryLink
  import="true"
  name="Cultist Firebrand"
  hidden="false"
  id="8c6e-1ee5-2c50-d61d"
  type="selectionEntry"
  targetId="cb66-af7-2cca-1c85">   <!-- targetId = ID selectionEntry в другом .cat -->

  <modifiers>
    <!-- Скрыть юнит, если Iconoclast Fiefdom НЕ выбран -->
    <modifier type="set" value="true" field="hidden">
      <conditionGroups>
        <conditionGroup type="and">
          <conditions>
            <!-- Условие 1: Iconoclast Fiefdom не выбран в ростере -->
            <condition type="lessThan" value="1"
              field="selections" scope="roster"
              childId="7fe8-de91-8976-e705"
              shared="true" includeChildSelections="true"/>
            <!-- Условие 2: не режим Crusade (cac3-71d1-ea4b-795d = Crusade force type) -->
            <condition type="lessThan" value="1"
              field="forces" scope="roster"
              childId="cac3-71d1-ea4b-795d"
              shared="true" includeChildSelections="true" includeChildForces="true"/>
          </conditions>
        </conditionGroup>
      </conditionGroups>
    </modifier>
    <!-- Добавить ошибку-подсказку если юнит добавлен не в тот детачмент -->
    <modifier type="add"
      value="This unit can only be included in an Iconoclast Fiefdom Detachment"
      field="error">...</modifier>
  </modifiers>

  <categoryLinks>
    <!-- Юнит автоматически получает категорию "Wretched" при добавлении в каталог CK -->
    <categoryLink name="Wretched" targetId="ac7d-42cc-342b-c911" .../>
  </categoryLinks>
</entryLink>
```

### Логика условия

| XML | Смысл |
|-----|-------|
| `type="lessThan" value="1" scope="roster" childId="7fe8-de91-8976-e705"` | В ростере не выбран Iconoclast Fiefdom (< 1 выборки) |
| `type="lessThan" value="1" field="forces" scope="roster" childId="cac3-71d1-ea4b-795d"` | Не режим Crusade/Campaign (игровой системный тип) |
| `conditionGroup type="and"` | Скрыть если **оба** условия выполнены одновременно |

Итого: юнит **скрыт** когда `(Iconoclast НЕ выбран) AND (не Crusade режим)`.  
В стандартной игре (matched play) Crusade force никогда не присутствует → юнит скрыт всегда, кроме случая с Iconoclast Fiefdom.

---

## Что сейчас делает wh40kAPI (неверно)

wh40kAPI при построении `unitsTree` ищет `<selectionEntry>` по `targetId` и читает его атрибут `hidden="false"`.  
Модификаторы, навешанные на `<entryLink>` в `.cat` файле каталога, **игнорируются** — они не применяются и не попадают в ответ.

**Результат**: все 17 Iconoclast-only юнитов Chaos Knights возвращаются с `hidden: false` и видны во всех детачментах.

```json
// Сейчас — неверно:
{ "id": "cb66-af7-2cca-1c85", "name": "Cultist Firebrand", "hidden": false, "modifierGroups": [] }
```

---

## Что должен делать wh40kAPI (требуемое)

При обходе `<entryLink>` необходимо проверять его собственные `<modifiers>`:

**Если на `<entryLink>` есть модификатор `type="set" field="hidden" value="true"` с условием `scope="roster" childId=<X>`** (в `conditionGroup type="and"`, где хотя бы одно условие — `scope="roster"` + BSData-ID детачмента):

→ Этот юнит зависит от детачмента.  
→ В `unitsTree` его нужно вернуть с:
- **`hidden: true`** — скрыт по умолчанию (нет детачмента → юнит не доступен)
- **`modifierGroups`** с **инвертированным** условием разблокировки (см. ниже)

### Требуемый ответ для Cultist Firebrand

```json
{
  "id": "cb66-af7-2cca-1c85",
  "name": "Cultist Firebrand",
  "entryType": "model",
  "hidden": true,
  "modifierGroups": [
    {
      "modifiers": "[{\"field\":\"hidden\",\"type\":\"set\",\"value\":\"false\"}]",
      "conditions": "[{\"field\":\"selections\",\"scope\":\"roster\",\"type\":\"atLeast\",\"value\":\"1\",\"childId\":\"7fe8-de91-8976-e705\"}]"
    }
  ]
}
```

### Алгоритм трансформации BSData → API

```
Входные данные (из <entryLink> в .cat):
  base hidden = "false"
  modifier: set hidden=true
  condition: lessThan 1, scope=roster, childId=<detachment-id>

Выходные данные (в API unitsTree):
  hidden = true  ← инверсия (default: нет детачмента → юнит скрыт)
  modifierGroups[]:
    modifiers: [{field:"hidden", type:"set", value:"false"}]  ← разблокирующий модификатор
    conditions: [{scope:"roster", childId:<detachment-id>, type:"atLeast", value:"1"}]  ← условие разблокировки
```

Условие `cac3-71d1-ea4b-795d` (Crusade force type, не входит в `wh40k-10e` репозиторий) — **игнорировать**: в стандартной игре оно никогда не выполняется, и его присутствие не меняет суть зависимости от детачмента.

---

## Полный список затронутых юнитов (Chaos Knights)

Все следующие `<entryLink>` в `Chaos - Chaos Knights.cat` содержат идентичную структуру условного скрытия (`childId="7fe8-de91-8976-e705"` = Iconoclast Fiefdom):

| entryLink id | targetId (ID в API) | Название |
|---|---|---|
| `b981-a2ac-86d0-1cbe` | `1780-25b8-ce0b-898d` | Dark Commune |
| `1a9d-4e67-9d1f-cb91` | `f69d-2171-5f95-9c88` | Traitor Enforcer |
| `5e6c-178c-92b1-2de6` | `8dc5-4dcb-d77f-7d23` | Traitor Guardsmen Squad |
| `e8d2-106a-e195-ae23` | `e1c2-8417-403a-68`   | Gellerpox Infected [Legends] |
| `46d0-40d6-adfb-db29` | `6bf7-888c-7aa6-6831` | Fellgor Beastmen |
| `8c6e-1ee5-2c50-d61d` | `cb66-af7-2cca-1c85`  | **Cultist Firebrand** |
| `affe-d1e3-0377-f6f5` | `1267-78f1-7774-859`  | Cultist Mob |
| `7613-f941-5829-876a` | `478-9d24-e5c8-c6f7`  | Cultist Mob with Firearms [Legends] |
| `f018-ea7f-b4a1-cf2f` | `afed-8173-a1e0-cbae` | Mutoid Vermin [Legends] |
| `998c-ff18-9548-783b` | `9238-473a-54ee-6b0e` | Negavolt Cultists [Legends] |
| `f200-6a81-b355-eeff` | `5b66-39e6-aeb5-8011` | Renegade Enforcer [Legends] |
| `847f-5171-f508-4397` | `9df-7c70-84d2-e095`  | Renegade Heavy Weapons Squad [Legends] |
| `c47c-1579-9a09-1eda` | `658e-a63f-bac7-6201` | Renegade Ogryn Beast Handler [Legends] |
| `072c-80c6-b7a3-f0e7` | `23aa-b45a-6d5d-e92b` | Accursed Cultists |
| `05d7-76a6-c285-af97` | `24c4-fa24-67ff-eef`  | Renegade Ogryn Brutes [Legends] |
| `d8f6-58e4-bac7-6a12` | `a7bb-ec24-40e6-5b8c` | Renegade Plague Ogryns [Legends] |
| `7df5-0ddc-5a83-0252` | `c0f9-d16c-6caf-5b95` | Rogue Psyker [Legends] |

**Все 17 юнитов должны вернуться с `hidden: true` и `modifierGroups` с `childId: "7fe8-de91-8976-e705"`.**

### ID детачментов Chaos Knights (для справки)

| Детачмент | ID (`<selectionEntry>` в `Chaos - Chaos Knights Library.cat`) |
|-----------|---------------------------------------------------------------|
| Houndpack Lance | `6cb5-45cf-c626-fa86` |
| **Iconoclast Fiefdom** | **`7fe8-de91-8976-e705`** |
| Infernal Lance | `812b-f056-ec50-2c3c` |
| Lords of Dread | `e5ab-9622-8b2a-84d0` |
| Traitoris Lance | `603e-6bcd-927f-cb70` |

---

## Как фронтенд использует эти данные

Функция `isUnlockedByDetachment()` в `src/services/api.ts` уже реализована и ждёт именно такого формата:

```typescript
// Проверяет: есть ли в modifierGroups записи условие разблокировки текущим детачментом?
function isUnlockedByDetachment(item, detachmentId) {
  for (const mg of item.modifierGroups ?? []) {
    const mods = JSON.parse(mg.modifiers ?? '[]');
    const conds = JSON.parse(mg.conditions ?? '[]');
    const unlocksHidden = mods.some(m => m.field === 'hidden' && m.value === 'false');
    const matchesDetachment = conds.some(c =>
      c.scope === 'roster' && c.childId === detachmentId
    );
    if (unlocksHidden && matchesDetachment) return true;
  }
  return false;
}
```

Логика в `collectUnits()`:
```typescript
// Пропускаем юнит если hidden=true и детачмент его не разблокирует
if (node.hidden === true && !isUnlockedByDetachment(node, detachmentId)) continue;
```

---

## Обобщение: паттерн для поиска в других каталогах

Паттерн в BSData XML, который нужно обрабатывать:

```xml
<entryLink hidden="false" targetId="<unit-id>" ...>
  <modifiers>
    <modifier type="set" value="true" field="hidden">
      <conditionGroups>
        <conditionGroup type="and">
          <conditions>
            <condition type="lessThan" value="1"
              field="selections" scope="roster"
              childId="<DETACHMENT-ID>"/>
            <!-- возможны дополнительные условия (Crusade mode и т.п.) -->
          </conditions>
        </conditionGroup>
      </conditionGroups>
    </modifier>
  </modifiers>
</entryLink>
```

Признак: `<entryLink>` с `<modifier type="set" value="true" field="hidden">` + условие `scope="roster"`.  
Аналогичные паттерны могут существовать в других каталогах (другие фракции с детачмент-эксклюзивными юнитами).

---

## Приоритет

Высокий. Без этого изменения 17 юнитов Chaos Knights (категория «Wretched Thralls») видны и доступны для всех детачментов, тогда как по правилам они допустимы **только** в детачменте «Iconoclast Fiefdom».
