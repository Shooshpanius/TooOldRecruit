import type { Faction, Unit, UnitCostBand, ModelEntry } from '../types';

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

export async function createRoster(token: string, data: { name: string; factionId: string; factionName: string; pointsLimit: number; allowLegends?: boolean }) {
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

export async function updateRoster(token: string, id: string, data: { name: string; pointsLimit: number; allowLegends: boolean }) {
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

export async function getRosterUnits(token: string, rosterId: string) {
  const res = await fetch(`${API_BASE}/rosters/${rosterId}/units`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch roster units');
  return res.json();
}

export async function updateRosterUnits(token: string, rosterId: string, units: unknown) {
  const res = await fetch(`${API_BASE}/rosters/${rosterId}/units`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(units),
  });
  if (!res.ok) throw new Error('Failed to update roster units');
}

// External API
export async function getFactions(): Promise<Faction[]> {
  try {
    const res = await fetch(`${WH40K_API}/fractions`);
    if (!res.ok) throw new Error('Failed to fetch factions');
    const data = await res.json();
    // The API returns fractions which represent factions
    const items: ApiCatalogueItem[] = Array.isArray(data.fractions)
      ? data.fractions
      : Array.isArray(data.catalogues)
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

interface ApiCostTier {
  id?: number;
  unitId?: string;
  minModels?: number | string;
  maxModels?: number | string;
  points?: number | string;
}

interface ApiCatalogueItem {
  id?: string;
  gameSystemId?: string;
  name?: string;
  gameSystemName?: string;
  parentId?: string;
}

interface ApiInfoLink {
  id?: string;
  name?: string;
  type?: string;
  targetId?: string;
}

interface ApiUnitItem {
  id?: string;
  name?: string;
  entryType?: string;
  type?: string;      // fallback for older API responses
  category?: string;
  categoryName?: string;
  categories?: Array<{ id?: string; name?: string; primary?: boolean }>;
  unitCategories?: Array<{ id?: string; name?: string; primary?: boolean }>;
  cost?: number | string;
  costs?: number | string | Array<{ name?: string; value?: number | string }>;
  points?: number | string;
  pts?: number | string;
  pointCost?: number | string;
  infoLinks?: ApiInfoLink[];
  // Максимальное количество отрядов данного типа в ростере
  maxInRoster?: number | string;
  // Диапазоны стоимости (из unitsTree)
  costTiers?: ApiCostTier[];
  tiers?: ApiCostTier[];
  // Дочерние узлы (из unitsTree)
  children?: ApiUnitItem[];
  // Идентификатор родительского узла; null означает корневой юнит (отряд)
  parentId?: string | null;
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
  { id: 'unit-1', name: 'Chapter Master', category: 'HQ', cost: 80 },
  { id: 'unit-2', name: 'Captain', category: 'HQ', cost: 80 },
  { id: 'unit-3', name: 'Librarian', category: 'HQ', cost: 70 },
  { id: 'unit-4', name: 'Chaplain', category: 'HQ', cost: 65 },
  { id: 'unit-5', name: 'Intercessor Squad', category: 'Troops', cost: 95 },
  { id: 'unit-6', name: 'Tactical Squad', category: 'Troops', cost: 100 },
  { id: 'unit-7', name: 'Scout Squad', category: 'Troops', cost: 65 },
  { id: 'unit-8', name: 'Terminator Squad', category: 'Elites', cost: 200 },
  { id: 'unit-9', name: 'Sternguard Veterans', category: 'Elites', cost: 135 },
  { id: 'unit-10', name: 'Dreadnought', category: 'Elites', cost: 150 },
  { id: 'unit-11', name: 'Assault Squad', category: 'Fast Attack', cost: 115 },
  { id: 'unit-12', name: 'Bike Squad', category: 'Fast Attack', cost: 90 },
  { id: 'unit-13', name: 'Land Speeder', category: 'Fast Attack', cost: 70 },
  { id: 'unit-14', name: 'Devastator Squad', category: 'Heavy Support', cost: 95 },
  { id: 'unit-15', name: 'Predator', category: 'Heavy Support', cost: 110 },
  { id: 'unit-16', name: 'Land Raider', category: 'Heavy Support', cost: 285 },
  { id: 'unit-17', name: 'Rhino', category: 'Dedicated Transport', cost: 75 },
  { id: 'unit-18', name: 'Drop Pod', category: 'Dedicated Transport', cost: 65 },
];

export async function getUnits(factionId: string): Promise<Unit[]> {
  try {
    const res = await fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/unitsTree`);
    if (!res.ok) throw new Error('Failed to fetch units');
    const data = await res.json();

    // Собираем корневые отряды: entryType "unit" или "model" без родительского unit-контейнера.
    // parentId === null означает корневую запись каталога; берём только unit и model-записи.
    function collectUnits(nodes: ApiUnitItem[]): ApiUnitItem[] {
      const result: ApiUnitItem[] = [];
      for (const node of nodes) {
        if (node.parentId === null && (node.entryType === 'unit' || node.entryType === 'model')) {
          result.push(node);
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          result.push(...collectUnits(node.children));
        }
      }
      return result;
    }

    let rootNodes: ApiUnitItem[];
    if (Array.isArray(data.units)) {
      rootNodes = data.units;
    } else if (Array.isArray(data.children)) {
      rootNodes = data.children;
    } else if (Array.isArray(data.nodes)) {
      rootNodes = data.nodes;
    } else if (Array.isArray(data)) {
      rootNodes = data as ApiUnitItem[];
    } else {
      rootNodes = [];
    }

    const items: ApiUnitItem[] = collectUnits(rootNodes);
    if (items.length === 0) return DEFAULT_UNITS;
    const toNum = (v: unknown): number | undefined => {
      if (v === null || v === undefined || v === '') return undefined;
      const n = Number(v);
      return isFinite(n) ? n : undefined;
    };
    const toNumStrict = (v: unknown): number => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    };
    return items.map((item) => {
      const cats = item.categories ?? item.unitCategories;
      const category =
        cats?.find(c => c.primary)?.name ??
        cats?.[0]?.name ??
        item.category ?? item.categoryName ?? item.entryType ?? item.type ?? 'Other';
      let cost: number | undefined;
      if (item.cost !== undefined) cost = toNum(item.cost);
      else if (item.points !== undefined) cost = toNum(item.points);
      else if (item.pts !== undefined) cost = toNum(item.pts);
      else if (item.pointCost !== undefined) cost = toNum(item.pointCost);
      else if (Array.isArray(item.costs)) {
        const pts = item.costs.find(c => { const n = c.name?.toLowerCase(); return n?.includes('pts') || n?.includes('point'); });
        const raw = pts?.value ?? item.costs[0]?.value;
        cost = toNum(raw);
      } else if (item.costs !== undefined) cost = toNum(item.costs);
      const isLeader = item.infoLinks?.some(l => l.type === 'rule' && l.name === 'Leader') ?? false;
      const maxInRoster = item.maxInRoster !== undefined ? toNum(item.maxInRoster) : undefined;

      // Парсим встроенные диапазоны стоимости (из unitsTree)
      const rawTiers = item.costTiers ?? item.tiers;
      const hasVariableCost = Array.isArray(rawTiers) && rawTiers.length > 0;
      const costBands: UnitCostBand[] | undefined = hasVariableCost
        ? (rawTiers as ApiCostTier[]).map(t => ({
            minModels: toNumStrict(t.minModels),
            maxModels: toNumStrict(t.maxModels),
            cost: toNumStrict(t.points),
          }))
        : undefined;

      // Если есть диапазоны — стоимость по умолчанию из первого диапазона
      if (hasVariableCost) {
        cost = costBands![0].cost;
      }

      // Для контейнеров типа unit собираем дочерние модели
      const modelChildren: ModelEntry[] | undefined =
        item.entryType === 'unit' && Array.isArray(item.children) && item.children.length > 0
          ? item.children
              .filter(c => c.entryType === 'model')
              .map(child => {
                let childCost: number | undefined;
                if (child.cost !== undefined) childCost = toNum(child.cost);
                else if (child.points !== undefined) childCost = toNum(child.points);
                else if (child.pts !== undefined) childCost = toNum(child.pts);
                else if (child.pointCost !== undefined) childCost = toNum(child.pointCost);
                else if (Array.isArray(child.costs)) {
                  const pts = child.costs.find(c => { const n = c.name?.toLowerCase(); return n?.includes('pts') || n?.includes('point'); });
                  const raw = pts?.value ?? child.costs[0]?.value;
                  childCost = toNum(raw);
                } else if (child.costs !== undefined) childCost = toNum(child.costs);

                const childRawTiers = child.costTiers ?? child.tiers;
                const childHasVariableCost = Array.isArray(childRawTiers) && childRawTiers.length > 0;
                const childCostBands: UnitCostBand[] | undefined = childHasVariableCost
                  ? (childRawTiers as ApiCostTier[]).map(t => ({
                      minModels: toNumStrict(t.minModels),
                      maxModels: toNumStrict(t.maxModels),
                      cost: toNumStrict(t.points),
                    }))
                  : undefined;
                if (childHasVariableCost && childCostBands) {
                  childCost = childCostBands[0].cost;
                }
                return {
                  id: child.id ?? child.name ?? '',
                  name: child.name ?? '',
                  cost: childCost,
                  costBands: childHasVariableCost ? childCostBands : undefined,
                  modelCount: childHasVariableCost && childCostBands ? childCostBands[0].minModels : undefined,
                  hasVariableCost: childHasVariableCost,
                } satisfies ModelEntry;
              })
          : undefined;

      // Если у unit-контейнера есть дочерние модели — стоимость равна сумме стоимостей моделей
      if (modelChildren && modelChildren.length > 0) {
        cost = modelChildren.reduce((sum, m) => sum + (m.cost ?? 0), 0);
      }

      return {
        id: item.id ?? item.name ?? '',
        name: item.name ?? '',
        category,
        cost,
        isLeader,
        maxInRoster,
        costBands: hasVariableCost ? costBands : undefined,
        modelCount: hasVariableCost && costBands ? costBands[0].minModels : undefined,
        hasVariableCost,
        entryType: item.entryType,
        models: modelChildren && modelChildren.length > 0 ? modelChildren : undefined,
      };
    });
  } catch (err) {
    console.error('Failed to fetch units from API, using defaults:', err);
    return DEFAULT_UNITS;
  }
}
