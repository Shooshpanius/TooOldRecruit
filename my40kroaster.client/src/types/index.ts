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
  maxModels: number;
  cost: number;
}

// Вложенная модель внутри контейнера типа unit
export interface ModelEntry {
  id: string;
  name: string;
  cost?: number;
  costBands?: UnitCostBand[];
  modelCount?: number;
  hasVariableCost?: boolean;
}

export interface Unit {
  id: string;
  name: string;
  category: string;
  cost?: number;
  isLeader?: boolean;
  // Максимальное количество отрядов данного типа в ростере (из API)
  maxInRoster?: number;
  // Диапазоны стоимости в зависимости от количества моделей
  costBands?: UnitCostBand[];
  // Выбранное количество моделей
  modelCount?: number;
  // Стоимость зависит от количества моделей в отряде
  hasVariableCost?: boolean;
  // Тип записи (unit / model)
  entryType?: string;
  // Вложенные модели для контейнеров типа unit
  models?: ModelEntry[];
}

export interface RosterUnit extends Unit {
  entryId: string;
}

export interface UnitGroup {
  id: string;
  units: RosterUnit[];
}
