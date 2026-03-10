import type { Faction, Unit, UnitCostBand } from '../types';

const API_BASE = '/api';
const WH40K_API = '/api/bsdata';

export const UNALIGNED_FORCES_ID = '581a-46b9-5b86-44b7';

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
  // Минимальное количество миниатюр (для контейнерных узлов)
  minInRoster?: number | string;
  // Диапазоны стоимости (из unitsTree)
  costTiers?: ApiCostTier[];
  tiers?: ApiCostTier[];
  // Дочерние узлы (из unitsTree)
  children?: ApiUnitItem[];
  // Идентификатор родительского узла; null означает корневой юнит (отряд)
  parentId?: string | null;
  // Идентификатор каталога, из которого пришёл узел (помогает определить Unaligned Forces)
  catalogueId?: string;
  // Внутренний флаг: юнит получен из раздела «Allied Units» связанного каталога
  _isAllied?: boolean;
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

    // Собираем отряды уровня «корень фракции»: узлы типа "unit" или "model".
    // Работает с двумя форматами ответа API:
    //   — плоский массив: все unit/model имеют parentId === null (текущий формат wh40kcards.ru);
    //   — древовидный формат: unit/model могут быть вложены внутри контейнерных узлов
    //     (категорий типа «HQ», «Battleline» и т.д.) — в таком случае parentId указывает на контейнер.
    //
    // Алгоритм (без проверки parentId):
    //   • Узел unit/model → добавляем в результат, НЕ рекурсируем в его children
    //     (дочерние модели — это состав отряда, не отдельные юниты).
    //   • Узел-контейнер (нет entryType, есть children) → рекурсируем вглубь с сохранением флага Allied.
    //   • Узел upgrade и прочие → пропускаем.
    //
    // insideAllied=true означает, что мы находимся внутри раздела связанного каталога
    // (например «Allied Units» или раздела с catalogueId Unaligned Forces).
    function collectUnits(nodes: ApiUnitItem[], insideAllied = false): ApiUnitItem[] {
      const result: ApiUnitItem[] = [];
      for (const node of nodes) {
        // Определяем: является ли текущий узел или его контекст разделом «союзных» юнитов.
        // Критерии:
        //   1. Уже находимся внутри Allied-раздела (флаг от родителя)
        //   2. Узел-контейнер (не unit/model) с именем, содержащим «allied» (без учёта регистра)
        //   3. catalogueId совпадает с Unaligned Forces
        const isAlliedSection = insideAllied
          || (!node.entryType && node.name?.toLowerCase().includes('allied'))
          || node.catalogueId === UNALIGNED_FORCES_ID;

        if (node.entryType === 'unit' || node.entryType === 'model') {
          // Отряд или модель — добавляем в результат.
          // В children находится состав отряда, а не отдельные юниты → не рекурсируем.
          result.push(isAlliedSection ? { ...node, _isAllied: true } : node);
        } else if (!node.entryType && Array.isArray(node.children) && node.children.length > 0) {
          // Контейнерный узел (категория, раздел каталога) — рекурсируем, ища вложенные отряды.
          result.push(...collectUnits(node.children, isAlliedSection));
        }
        // Узлы типа "upgrade" и прочие пропускаем.
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

    const mapItem = (item: ApiUnitItem, depth = 0): Unit => {
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
            // null maxModels означает «не ограничено» — сохраняем как undefined (не 0!)
            maxModels: toNum(t.maxModels),
            cost: toNumStrict(t.points),
          }))
        : undefined;

      // Если есть диапазоны — стоимость по умолчанию из первого диапазона
      if (hasVariableCost) {
        cost = costBands![0].cost;
      }

      const entryType = item.entryType === 'unit' || item.entryType === 'model'
        ? (item.entryType as 'unit' | 'model')
        : undefined;

      // Строим дерево дочерних узлов для контейнеров типа "unit".
      // Сохраняем промежуточные контейнеры (entryType=null) как узлы дерева,
      // чтобы в UI отображалась полная иерархия вложенности через children.
      // parentCostBands — диапазоны родительского [U], передаются дочерним [M] без собственных costTiers
      // (пример: Poxwalkers [U] имеет costTiers, а дочерний [M] "Poxwalker" — нет).
      // isNestedInContainer — признак рекурсивного вызова из промежуточного контейнера.
      // При isNestedInContainer=true синтетический контейнер НЕ создаётся, чтобы не обёртывать
      // реальные модели (например, модели внутри «1-2 Gun Servitors» и «5-10 Acolytes»)
      // в лишний слой, нарушающий структуру Case 4.
      function buildChildTree(children: ApiUnitItem[], parentCostBands?: UnitCostBand[], isNestedInContainer = false): Unit[] {
        const result: Unit[] = [];

        // Если у [U] есть costBands и несколько прямых [M]-детей без промежуточного контейнера
        // (пример: Pteraxii Skystalkers — Alpha + Skystalkers), создаём синтетический контейнер.
        // Это нужно, чтобы корректно работал Case 3 (Blightlord-подобный) в UI:
        // «фиксированные» [M] (min === max) → обязательные, «переменные» → в контейнере.
        // НЕ применяем в рекурсивных вызовах из промежуточных контейнеров (isNestedInContainer=true),
        // чтобы не ломать структуру Case 4 (например, Inquisitorial Agents).
        const directModelChildren = children.filter(c => c.entryType === 'model');
        const containerChildren = children.filter(
          c => !c.entryType && Array.isArray(c.children) && c.children.length > 0
        );
        const needSyntheticContainer =
          !isNestedInContainer &&
          parentCostBands &&
          directModelChildren.length >= 2 &&
          containerChildren.length === 0;

        if (needSyntheticContainer) {
          // «Фиксированные» модели: minInRoster === maxInRoster (всегда одинаковое количество)
          const fixedModels = directModelChildren.filter(
            m =>
              m.minInRoster != null &&
              m.maxInRoster != null &&
              Number(m.minInRoster) === Number(m.maxInRoster)
          );
          // «Переменные» модели: количество может меняться
          const varModels = directModelChildren.filter(
            m =>
              !(
                m.minInRoster != null &&
                m.maxInRoster != null &&
                Number(m.minInRoster) === Number(m.maxInRoster)
              )
          );

          // Фиксированные → обязательные прямые дочерние (без наследования costBands)
          for (const fixed of fixedModels) {
            const modelUnit = mapItem(fixed, depth + 1);
            const minCount = fixed.minInRoster !== undefined ? toNum(fixed.minInRoster) : undefined;
            result.push(minCount !== undefined ? { ...modelUnit, minCount } : modelUnit);
          }

          // Переменные → синтетический контейнер (без costBands на каждой модели)
          if (varModels.length > 0) {
            const varModelUnits: Unit[] = varModels.map(vm => {
              const modelUnit = mapItem(vm, depth + 1);
              const minCount = vm.minInRoster !== undefined ? toNum(vm.minInRoster) : undefined;
              return minCount !== undefined ? { ...modelUnit, minCount } : modelUnit;
            });
            const containerMinCount = varModels.reduce(
              (s, vm) => s + (toNum(vm.minInRoster) ?? 0),
              0
            );
            const containerMaxCount = varModels.reduce(
              (s, vm) => s + (toNum(vm.maxInRoster) ?? 99),
              0
            );
            result.push({
              id: `synthetic-container-${item.id ?? ''}`,
              name: '',
              category: '',
              cost: undefined,
              entryType: undefined,
              models: varModelUnits,
              minCount: containerMinCount,
              maxCount: containerMaxCount,
            });
          }
          return result;
        }

        for (const child of children) {
          if (child.entryType === 'model') {
            const modelUnit = mapItem(child, depth + 1);
            // Сохраняем minInRoster как minCount для прямых дочерних моделей
            // (используется для расчёта обязательного количества моделей в Blightlord-подобных юнитах)
            const minCount = child.minInRoster !== undefined ? toNum(child.minInRoster) : undefined;
            // Если у [M] нет собственных costBands, но у родительского [U] есть — наследуем
            if (!modelUnit.costBands && parentCostBands && parentCostBands.length > 0) {
              result.push({
                ...modelUnit,
                minCount,
                costBands: parentCostBands,
                hasVariableCost: true,
                modelCount: parentCostBands[0]?.minModels ?? 0,
              });
            } else {
              result.push(minCount !== undefined ? { ...modelUnit, minCount } : modelUnit);
            }
          } else if (!child.entryType && Array.isArray(child.children) && child.children.length > 0) {
            // Промежуточный контейнер — передаём parentCostBands дальше по дереву.
            // isNestedInContainer=true запрещает создание синтетического контейнера в рекурсивном вызове,
            // чтобы модели внутри независимых контейнеров (Case 4) не обёртывались лишним слоем.
            const nested = buildChildTree(child.children, parentCostBands, true);
            if (nested.length > 0) {
              result.push({
                id: child.id ?? child.name ?? '',
                name: child.name ?? '',
                category: '',
                cost: undefined,
                entryType: undefined,
                models: nested,
                // Сохраняем ограничения контейнера: используются для отрядов с несколькими типами моделей
                minCount: child.minInRoster !== undefined ? toNum(child.minInRoster) : undefined,
                maxCount: child.maxInRoster !== undefined ? toNum(child.maxInRoster) : undefined,
              });
            }
          }
          // Узлы типа "upgrade" и прочие — пропускаем
        }
        return result;
      }
      const models: Unit[] | undefined = depth === 0 && entryType === 'unit' && Array.isArray(item.children)
        ? buildChildTree(item.children, hasVariableCost ? costBands : undefined)
        : undefined;

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
        entryType,
        models: models && models.length > 0 ? models : undefined,
        isAllied: item._isAllied === true,
      };
    };

    return items.map(item => mapItem(item));
  } catch (err) {
    console.error('Failed to fetch units from API, using defaults:', err);
    return DEFAULT_UNITS;
  }
}
