import type { Faction } from '../types';

const API_BASE = '/api';
const WH40K_API = 'https://api.wh40kcards.ru';

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
    const res = await fetch(`${WH40K_API}/bsdata/catalogues`);
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
