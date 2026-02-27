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
  createdAt: string;
  updatedAt: string;
}

export interface Faction {
  id: string;
  name: string;
  parentId?: string;
}
