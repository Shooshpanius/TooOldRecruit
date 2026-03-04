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

export interface Unit {
  id: string;
  name: string;
  category: string;
  cost?: number;
  isLeader?: boolean;
  // Максимальное количество отрядов данного типа в ростере (из API)
  maxInRoster?: number;
  // Ценовые диапазоны для отрядов с переменным количеством моделей
  costBands?: UnitCostBand[];
  // Выбранное количество моделей (задаётся при добавлении в ростер)
  modelCount?: number;
}

export interface UnitCostBand {
  minModels: number;
  maxModels: number;
  cost: number;
}

export interface RosterUnit extends Unit {
  entryId: string;
}

export interface UnitGroup {
  id: string;
  units: RosterUnit[];
}
