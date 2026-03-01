import type { Faction, Unit } from '../types';

const API_BASE = '/api';
const WH40K_API = '/api/bsdata';

// Auth
export async function loginWithGoogle(idToken: string) {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json() as Promise<{ token: string; user: { id: string; email: string; name: string; picture?: string } }>;
}

// Rosters
export async function getRosters(token: string) {
  const res = await fetch(`${API_BASE}/rosters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch rosters');
  return res.json();
}

export async function createRoster(token: string, data: { name: string; factionId: string; factionName: string; pointsLimit: number }) {
  const res = await fetch(`${API_BASE}/rosters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create roster');
  return res.json();
}

export async function updateRoster(token: string, id: string, data: { name: string; pointsLimit: number }) {
  const res = await fetch(`${API_BASE}/rosters/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update roster');
  return res.json();
}

export async function deleteRoster(token: string, id: string) {
  const res = await fetch(`${API_BASE}/rosters/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete roster');
}

// External API
export async function getFactions(): Promise<Faction[]> {
  try {
    const res = await fetch(`${WH40K_API}/catalogues`);
    if (!res.ok) throw new Error('Failed to fetch factions');
    const data = await res.json();
    // The API returns catalogues which represent factions
    const items: ApiCatalogueItem[] = Array.isArray(data.catalogues)
      ? data.catalogues
      : Array.isArray(data)
      ? (data as ApiCatalogueItem[])
      : [];
    if (items.length === 0) return DEFAULT_FACTIONS;
    return items.map((item) => ({
      id: item.id ?? item.gameSystemId ?? item.name ?? '',
      name: item.name ?? item.gameSystemName ?? '',
      parentId: item.parentId,
    }));
  } catch (err) {
    console.error('Failed to fetch factions from API, using defaults:', err);
    return DEFAULT_FACTIONS;
  }
}

interface ApiCatalogueItem {
  id?: string;
  gameSystemId?: string;
  name?: string;
  gameSystemName?: string;
  parentId?: string;
}

interface ApiUnitItem {
  id?: string;
  name?: string;
  entryType?: string;
  type?: string;      // fallback for older API responses
  category?: string;
  categoryName?: string;
  unitCategories?: Array<{ id?: string; name?: string; primary?: boolean }>;
}

const DEFAULT_FACTIONS: Faction[] = [
  { id: 'space-marines', name: 'Space Marines' },
  { id: 'chaos-space-marines', name: 'Chaos Space Marines' },
  { id: 'necrons', name: 'Necrons' },
  { id: 'tyranids', name: 'Tyranids' },
  { id: 'orks', name: 'Orks' },
  { id: 'tau', name: "T'au Empire" },
  { id: 'eldar', name: 'Aeldari' },
  { id: 'dark-eldar', name: 'Drukhari' },
  { id: 'sisters-of-battle', name: 'Adepta Sororitas' },
  { id: 'imperial-guard', name: 'Astra Militarum' },
  { id: 'death-guard', name: 'Death Guard' },
  { id: 'thousand-sons', name: 'Thousand Sons' },
  { id: 'world-eaters', name: 'World Eaters' },
  { id: 'daemons', name: 'Chaos Daemons' },
  { id: 'dark-angels', name: 'Dark Angels' },
  { id: 'blood-angels', name: 'Blood Angels' },
  { id: 'space-wolves', name: 'Space Wolves' },
];

const DEFAULT_UNITS: Unit[] = [
  { id: 'unit-1', name: 'Chapter Master', category: 'HQ' },
  { id: 'unit-2', name: 'Captain', category: 'HQ' },
  { id: 'unit-3', name: 'Librarian', category: 'HQ' },
  { id: 'unit-4', name: 'Chaplain', category: 'HQ' },
  { id: 'unit-5', name: 'Intercessor Squad', category: 'Troops' },
  { id: 'unit-6', name: 'Tactical Squad', category: 'Troops' },
  { id: 'unit-7', name: 'Scout Squad', category: 'Troops' },
  { id: 'unit-8', name: 'Terminator Squad', category: 'Elites' },
  { id: 'unit-9', name: 'Sternguard Veterans', category: 'Elites' },
  { id: 'unit-10', name: 'Dreadnought', category: 'Elites' },
  { id: 'unit-11', name: 'Assault Squad', category: 'Fast Attack' },
  { id: 'unit-12', name: 'Bike Squad', category: 'Fast Attack' },
  { id: 'unit-13', name: 'Land Speeder', category: 'Fast Attack' },
  { id: 'unit-14', name: 'Devastator Squad', category: 'Heavy Support' },
  { id: 'unit-15', name: 'Predator', category: 'Heavy Support' },
  { id: 'unit-16', name: 'Land Raider', category: 'Heavy Support' },
  { id: 'unit-17', name: 'Rhino', category: 'Dedicated Transport' },
  { id: 'unit-18', name: 'Drop Pod', category: 'Dedicated Transport' },
];

export async function getUnits(factionId: string): Promise<Unit[]> {
  try {
    const res = await fetch(`${WH40K_API}/catalogues/${encodeURIComponent(factionId)}/units`);
    if (!res.ok) throw new Error('Failed to fetch units');
    const data = await res.json();
    const items: ApiUnitItem[] = Array.isArray(data.units)
      ? data.units
      : Array.isArray(data)
      ? (data as ApiUnitItem[])
      : [];
    if (items.length === 0) return DEFAULT_UNITS;
    return items.map((item) => {
      const unitCat =
        item.unitCategories?.find(c => c.primary)?.name ??
        item.unitCategories?.[0]?.name;
      return {
        id: item.id ?? item.name ?? '',
        name: item.name ?? '',
        category: unitCat ?? item.category ?? item.categoryName ?? item.entryType ?? item.type ?? 'Other',
      };
    });
  } catch (err) {
    console.error('Failed to fetch units from API, using defaults:', err);
    return DEFAULT_UNITS;
  }
}
