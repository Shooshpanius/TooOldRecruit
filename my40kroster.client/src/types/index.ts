export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface Roster {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  pointsLimit: number;
  allowLegends: boolean;
  // Название детачмента армии (необязательное поле)
  detachmentName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Faction {
  id: string;
  name: string;
  parentId?: string;
}

export interface UnitCostBand {
  minModels: number;
  // undefined означает «не ограничено сверху» (открытый диапазон, maxModels=null в API)
  maxModels?: number;
  cost: number;
}

// Профиль характеристик из BSData (GET /fractions/{id}/unitsTree → profiles[]).
// typeName = "Unit" → характеристики модели (M/T/Sv/W/Ld/OC).
// typeName содержит "Weapons" → характеристики оружия (Range/A/BS|WS/S/AP/D).
// characteristics — JSON-строка вида "{\"M\":\"5\"\",\"T\":\"5\",...}".
export interface UnitProfile {
  name: string;
  typeName: string;
  characteristics: string; // JSON string, parse to Record<string, string>
}

// Одна единица оружия: дочерний upgrade-узел с профилями и ключевыми словами.
export interface UnitWeapon {
  id: string;
  name: string;
  // Ключевые слова оружия (из infoLinks type=rule дочернего узла)
  keywords: string[];
  // Профили оружия (Range/A/BS|WS/S/AP/D)
  profiles: UnitProfile[];
}

// Детачмент-зависимая опция (апгрейд с чекбоксом), доступная при выборе конкретного детачмента.
// Пример: «Houndpack Lance Character» для War Dog при детачменте Houndpack Lance.
export interface UnitDetachmentUpgrade {
  id: string;
  name: string;
  // Минимальное количество выбранных экземпляров данного апгрейда в ростере (roster-wide)
  minInRoster?: number;
  // Максимальное количество выбранных экземпляров данного апгрейда в ростере (roster-wide)
  maxInRoster?: number;
}

export interface Unit {
  id: string;
  name: string;
  category: string;
  cost?: number;
  isLeader?: boolean;
  // Максимальное количество отрядов данного типа в ростере (из API)
  maxInRoster?: number;
  // Минимальное количество отрядов данного типа в ростере (из API или статического fallback)
  minInRoster?: number;
  // Диапазоны стоимости в зависимости от количества моделей
  costBands?: UnitCostBand[];
  // Выбранное количество моделей
  modelCount?: number;
  // Стоимость зависит от количества моделей в отряде
  hasVariableCost?: boolean;
  // Тип записи из каталога: "unit" или "model"
  entryType?: 'unit' | 'model';
  // Вложенные модели (только для контейнеров entryType="unit")
  models?: Unit[];
  // Юнит из раздела «Allied Units» (союзные войска из связанного каталога)
  isAllied?: boolean;
  // Минимальное суммарное количество миниатюр (из контейнерного узла каталога)
  minCount?: number;
  // Максимальное суммарное количество миниатюр (из контейнерного узла каталога)
  maxCount?: number;
  // Количество миниатюр по каждому типу модели (для отрядов с несколькими типами моделей)
  modelCounts?: Record<string, number>;
  // Идентификатор взаимоисключающей группы: модели с одинаковым exclusiveGroup — «максимум одна из группы».
  // Источник: динамически из modifierGroups API (deriveXorGroups в api.ts) или, если API ещё не
  // возвращает modifierGroups, из резервной таблицы CONTAINER_EXCLUSIVE_GROUPS в api.ts.
  exclusiveGroup?: string;
  // Детачмент-зависимые опции (апгрейды с чекбоксами), доступные при текущем детачменте.
  // Заполняется в api.ts из дочерних upgrade-записей с детачмент-условным скрытием.
  // Пример: «Houndpack Lance Character» у War Dog при Houndpack Lance.
  detachmentUpgrades?: UnitDetachmentUpgrade[];
  // IDs выбранных детачмент-апгрейдов для данного юнита в ростере.
  // Сохраняется в составе данных ростера.
  selectedUpgradeIds?: string[];
  // Профили BSData: характеристики юнита (typeName="Unit") из /unitsTree.
  // Появились после обновления wh40kAPI (включение profiles в unitsTree).
  profiles?: UnitProfile[];
  // Оружие юнита: дочерние upgrade-записи с профилями и ключевыми словами.
  // Появилось после обновления wh40kAPI (profiles на дочерних узлах).
  weapons?: UnitWeapon[];
  // Все ключевые слова юнита (из categories где primary=false).
  // Появились после обновления wh40kAPI (все категории, не только primary).
  keywords?: string[];
  // Имена способностей юнита (из infoLinks type=rule, кроме «Leader»).
  abilities?: string[];
}

export interface RosterUnit extends Unit {
  entryId: string;
}

export interface UnitGroup {
  id: string;
  units: RosterUnit[];
}
