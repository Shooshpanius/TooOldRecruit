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
}

export interface RosterUnit extends Unit {
  entryId: string;
}

export interface UnitGroup {
  id: string;
  units: RosterUnit[];
}
