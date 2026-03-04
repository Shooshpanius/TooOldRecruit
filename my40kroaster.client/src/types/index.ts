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
}

export interface RosterUnit extends Unit {
  entryId: string;
}

export interface UnitGroup {
  id: string;
  units: RosterUnit[];
}
