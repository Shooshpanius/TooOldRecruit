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

export async function createRoster(token: string, data: { name: string; factionId: string; factionName: string; pointsLimit: number; allowLegends?: boolean; detachmentName?: string }) {
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

export async function updateRoster(token: string, id: string, data: { name: string; pointsLimit: number; allowLegends: boolean; detachmentName?: string }) {
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

// Детачмент с идентификатором — возвращается эндпоинтом /detachments после обновления wh40kAPI.
export interface Detachment {
  id: string;
  name: string;
}

// Загружает список детачментов для выбранной фракции через прокси-эндпоинт.
// API возвращает {id, name}[] (после обновления wh40kAPI).
// Поддерживается устаревший формат string[] (id будет пустой строкой).
// Возвращает пустой массив если фракция не поддерживает детачменты или API недоступен.
export async function getDetachments(factionId: string): Promise<Detachment[]> {
  try {
    const res = await fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/detachments`);
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    if (arr.length === 0) return [];
    // Поддерживаем устаревший формат string[] наряду с новым {id, name}[]
    if (typeof arr[0] === 'string') {
      return (arr as string[]).map(name => ({ id: '', name }));
    }
    return arr as Detachment[];
  } catch {
    return [];
  }
}

// Условие детачмента для юнита, возвращаемое эндпоинтом /detachment-conditions.
// unitId — BSData GUID юнита (targetId из entryLink в .cat-файле).
// detachmentIds — список BSData GUID детачментов, при которых юнит доступен (OR-логика).
export interface UnitDetachmentCondition {
  unitId: string;
  detachmentIds: string[];
}

// Загружает условия детачментов для юнитов фракции.
// wh40kAPI разбирает entryLink-модификаторы из BSData .cat-файлов и возвращает
// карту: для каждого юнита — список детачментов, при которых он доступен.
// При ошибке или пока wh40kAPI не реализовал этот эндпоинт возвращает пустой массив —
// клиент в этом случае использует статический DETACHMENT_EXCLUSIVE_UNITS как резервный источник.
export async function getUnitDetachmentConditions(factionId: string): Promise<UnitDetachmentCondition[]> {
  try {
    const res = await fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/detachment-conditions`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as UnitDetachmentCondition[]) : [];
  } catch {
    return [];
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
  // Флаг скрытия по умолчанию (из BSData): true = запись скрыта до применения условных модификаторов.
  // Добавлено в ответ /fractions/{id}/unitsTree после обновления wh40kAPI.
  hidden?: boolean;
  // Группы модификаторов из BSData — могут кодировать условия скрытия (XOR-взаимоисключение).
  // Поле присутствует в ответе API (обновлено в wh40kAPI), но содержит только BsDataModifierGroup
  // уровня юнита (Crusade и т.п.) — НЕ содержит XOR-модификаторов отдельных entry-нод.
  //
  // Для работы deriveXorGroups нужно, чтобы API также экспортировал индивидуальные
  // modifier-элементы (type="set", field="hidden", value="true" с condition childId) с каждого
  // дочернего узла модели внутри контейнера. В BSData они хранятся как <modifier> на <selectionEntry>,
  // а не как <modifierGroup> на юните. Требуется отдельная таблица BsDataModifier в wh40kAPI
  // и поле entryModifiers?: ... в ответе /fractions/{id}/unitsTree для дочерних узлов.
  //
  // До реализации этого динамического подхода XOR обеспечивается через
  // статическую таблицу CONTAINER_EXCLUSIVE_GROUPS ниже.
  modifierGroups?: Array<{ id?: number; unitId?: string; modifiers?: string | null; conditions?: string | null }>;
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

// Резервная карта взаимоисключающих групп по id контейнера.
// Ключ — id контейнера, значение — массив групп (каждая группа = список id моделей, из которых можно выбрать максимум одну).
// В BSData взаимоисключение кодируется через modifier type="set" field="hidden" value="true"
// с condition type="atLeast" childId=<сиблинг> на уровне entry-узла (не modifierGroup юнита).
// Динамическая альтернатива через deriveXorGroups не работает с текущим форматом API,
// т.к. XOR-условия хранятся в entry-level modifier-ах, не попадающих в modifierGroups.
const CONTAINER_EXCLUSIVE_GROUPS: Record<string, string[][]> = {
  // Skitarii Rangers: «9 Skitarii Rangers» — data-tether XOR omnispex
  '24a0-5541-79b2-b1ff': [['f525-f4d5-1ea1-ecaf', '626e-72e0-7869-82c1']],
  // Skitarii Vanguard: «Skitarii Vanguard» — data-tether XOR omnispex
  'c00c-540d-818e-9f44': [['ef06-ef9-2ff7-f92d', 'd3d5-8552-186c-8436']],
  // Secutarii Hoplites [Legends]
  'cf89-9b00-1708-2d59': [['30e9-da2c-e26b-fc20', 'a393-2cf0-b5f6-c624']],
  // Secutarii Peltasts [Legends]
  '347a-c7c2-1bc8-db33': [['efff-ac31-c7a5-93c6', 'fec1-2c41-7ea4-480e']],
};

// Резервная статическая карта юнитов, доступных только при конкретном детачменте.
// Используется как fallback, когда сервер не может получить данные из BSData GitHub
// (например, при недоступности сети или ошибке парсинга).
//
// Основной источник этих данных — эндпоинт /api/bsdata/fractions/{id}/detachment-conditions,
// который читает BSData .cat-файлы напрямую из github.com/BSData/wh40k-10e.
//
// В BSData паттерн скрытия: <entryLink> → <modifier type="set" field="hidden" value="true">
// + <condition type="lessThan" scope="roster" childId="<detachmentId>">.
// Это означает «скрыть юнит, если указанный детачмент не выбран в ростере».
//
// Ключ — BSData GUID юнита (targetId из entryLink),
// значение — массив BSData GUID детачментов, при которых юнит доступен (OR-логика).
//
// Chaos Knights: все юниты категории «Wretched Thralls» (ac7d-42cc-342b-c911)
// доступны только в детачменте «Iconoclast Fiefdom» (7fe8-de91-8976-e705).
// Источник: Chaos - Chaos Knights.cat (github.com/BSData/wh40k-10e)
const DETACHMENT_EXCLUSIVE_UNITS: Record<string, string[]> = {
  // ── Chaos Knights → Iconoclast Fiefdom only ──────────────────────────────
  '1780-25b8-ce0b-898d': ['7fe8-de91-8976-e705'], // Dark Commune
  'f69d-2171-5f95-9c88': ['7fe8-de91-8976-e705'], // Traitor Enforcer
  '8dc5-4dcb-d77f-7d23': ['7fe8-de91-8976-e705'], // Traitor Guardsmen Squad
  'e1c2-8417-403a-68':   ['7fe8-de91-8976-e705'], // Gellerpox Infected [Legends] (краткий GUID — сверен с BSData и API)
  '6bf7-888c-7aa6-6831': ['7fe8-de91-8976-e705'], // Fellgor Beastmen
  'cb66-af7-2cca-1c85':  ['7fe8-de91-8976-e705'], // Cultist Firebrand
  '1267-78f1-7774-859':  ['7fe8-de91-8976-e705'], // Cultist Mob
  '478-9d24-e5c8-c6f7':  ['7fe8-de91-8976-e705'], // Cultist Mob with Firearms [Legends]
  'afed-8173-a1e0-cbae': ['7fe8-de91-8976-e705'], // Mutoid Vermin [Legends]
  '9238-473a-54ee-6b0e': ['7fe8-de91-8976-e705'], // Negavolt Cultists [Legends]
  '5b66-39e6-aeb5-8011': ['7fe8-de91-8976-e705'], // Renegade Enforcer [Legends]
  '9df-7c70-84d2-e095':  ['7fe8-de91-8976-e705'], // Renegade Heavy Weapons Squad [Legends]
  '658e-a63f-bac7-6201': ['7fe8-de91-8976-e705'], // Renegade Ogryn Beast Handler [Legends]
  '23aa-b45a-6d5d-e92b': ['7fe8-de91-8976-e705'], // Accursed Cultists
  '24c4-fa24-67ff-eef':  ['7fe8-de91-8976-e705'], // Renegade Ogryn Brutes [Legends]
  'a7bb-ec24-40e6-5b8c': ['7fe8-de91-8976-e705'], // Renegade Plague Ogryns [Legends]
  'c0f9-d16c-6caf-5b95': ['7fe8-de91-8976-e705'], // Rogue Psyker [Legends]
};

// Карта BSData GUID категорий → отображаемое имя.
// Используется при разрешении модификаторов типа set-primary category, которые ссылаются
// на BSData ID записи категории (categoryEntry), а не на текстовое имя.
const CATEGORY_GUID_NAMES: Record<string, string> = {
  'e338-111e-d0c6-b687': 'Battleline',
};

// Резервная статическая карта изменений категории и лимита юнитов при выборе детачмента.
// Используется как fallback для BSData паттерна, когда wh40kAPI НЕ экспортирует top-level
// <modifier> элементы selectionEntry (он экспортирует только <modifierGroup>).
//
// BSData паттерн (НЕ поддерживаемый wh40kAPI /unitsTree):
//   <modifier type="set-primary" value="<categoryGUID>" field="category">
//     <conditions>
//       <condition type="atLeast" scope="roster" childId="<detachmentId>"/>
//     </conditions>
//   </modifier>
//
// Для сравнения, World Eaters (Goremongers/Jakhals + Cult of Blood) используют <modifierGroup> —
// их данные уже корректно экспортируются API и обрабатываются динамически без fallback.
//
// Ключ первого уровня — BSData GUID детачмента.
// Ключ второго уровня — BSData GUID юнита.
// Значение — переопределения category и/или maxInRoster при активном детачменте.
//
// Задача для wh40kAPI: добавить экспорт top-level entry-level модификаторов selectionEntry
// в поле entryModifiers ответа /fractions/{id}/unitsTree.
// Репозиторий wh40kAPI: https://github.com/Shooshpanius/wh40kAPI
const DETACHMENT_UNIT_OVERRIDES: Record<string, Record<string, { category?: string; maxInRoster?: number }>> = {
  // ── Chaos Knights → Houndpack Lance (6cb5-45cf-c626-fa86) ─────────────────────────
  // Все юниты War Dog становятся Battleline, лимит увеличивается с 3 до 6
  // (правило детачмента: в армии должно быть не менее 3 юнитов War Dog).
  // BSData (Chaos - Chaos Knights Library.cat):
  //   modifier type="set-primary" value="e338-111e-d0c6-b687" scope="roster" childId="6cb5-45cf-c626-fa86"
  //   modifier type="set" value="6" field="<force-scope-max-constraint-id>"
  '6cb5-45cf-c626-fa86': {
    '8df0-fc3c-8ced-ffce': { category: 'Battleline', maxInRoster: 6 }, // War Dog Executioner
    '753d-4e02-eda3-4809': { category: 'Battleline', maxInRoster: 6 }, // War Dog Brigand
    'bbc6-c0ed-24e8-86b7': { category: 'Battleline', maxInRoster: 6 }, // War Dog Stalker
    'e96b-ac98-7fd2-a155': { category: 'Battleline', maxInRoster: 6 }, // War Dog Karnivore
    '6e6d-7950-ce6d-4cd4': { category: 'Battleline', maxInRoster: 6 }, // War Dog Huntsman
    'ae7c-3679-a88-6895':  { category: 'Battleline', maxInRoster: 6 }, // War Dog Moirax
  },
  // ── Space Marines → Company of Hunters (41e6-d47c-5e68-e066) ──────────────────────
  // Outrider Squad становится Battleline, лимит увеличивается с 3 до 6.
  // BSData (Imperium - Space Marines.cat):
  //   modifier type="set-primary" value="e338-111e-d0c6-b687" scope="force" childId="41e6-d47c-5e68-e066"
  '41e6-d47c-5e68-e066': {
    'b5e8-c34b-566b-8bda': { category: 'Battleline', maxInRoster: 6 }, // Outrider Squad
  },
  // ── Orks → Dread Mob (807c-9732-5465-5ca5) ────────────────────────────────────────
  // Gretchin становятся Battleline, лимит увеличивается с 3 до 6.
  // BSData (Orks.cat):
  //   modifier type="set-primary" value="e338-111e-d0c6-b687" scope="roster" childId="807c-9732-5465-5ca5"
  '807c-9732-5465-5ca5': {
    'de8f-24f9-c543-92b7': { category: 'Battleline', maxInRoster: 6 }, // Gretchin
  },
  // ── Orks → Taktikal Brigade (fdd5-9868-a9ee-e9f1) ─────────────────────────────────
  // Stormboyz становятся Battleline, лимит увеличивается с 3 до 6.
  // BSData (Orks.cat):
  //   modifier type="set-primary" value="e338-111e-d0c6-b687" scope="force" childId="fdd5-9868-a9ee-e9f1"
  'fdd5-9868-a9ee-e9f1': {
    '4adf-8249-c6b2-dd4f': { category: 'Battleline', maxInRoster: 6 }, // Stormboyz
  },
};

// Возвращает результирующие category и maxInRoster для узла с учётом активного детачмента.
// Шаг 1 (динамический): обрабатывает modifierGroups с условием scope="force"|"roster" childId=detachmentId.
//   Применяется к фракциям, использующим <modifierGroup> в BSData (например, World Eaters).
// Шаг 2 (статический fallback): DETACHMENT_UNIT_OVERRIDES — для случаев, когда wh40kAPI
//   не экспортирует top-level entry-level модификаторы selectionEntry (только <modifierGroup>).
//   Применяется к Chaos Knights (War Dogs + Houndpack Lance), Space Marines (Outrider Squad),
//   Orks (Gretchin, Stormboyz).
// Поддерживаемые модификаторы:
//   • type="set-primary" field="category" — смена категории (value — BSData GUID из CATEGORY_GUID_NAMES);
//   • type="set" field=<GUID> value=<число> — замена maxInRoster (field — ID ограничения BSData).
function applyDetachmentModifiers(
  item: ApiUnitItem,
  detachmentId: string | undefined,
  currentCategory: string,
  currentMaxInRoster: number | undefined,
): { category: string; maxInRoster: number | undefined } {
  if (!detachmentId) {
    return { category: currentCategory, maxInRoster: currentMaxInRoster };
  }

  let category = currentCategory;
  let maxInRoster = currentMaxInRoster;

  // Шаг 1: динамический путь через modifierGroups (World Eaters и другие, где BSData использует <modifierGroup>).
  if (item.modifierGroups?.length) {
    for (const group of item.modifierGroups) {
      // Проверяем условия: нужна группа с условием scope="force"|"roster" childId=detachmentId.
      // scope="force" — условие в рамках текущей армии (force).
      // scope="roster" — условие на уровне всего ростера.
      let conditionMatches = false;
      try {
        if (group.conditions && typeof group.conditions === 'string') {
          const conds = JSON.parse(group.conditions) as Array<{
            scope?: string;
            type?: string;
            childId?: string;
          }>;
          conditionMatches = conds.some(
            c => (c.scope === 'force' || c.scope === 'roster') && c.childId === detachmentId,
          );
        }
      } catch {
        continue;
      }
      if (!conditionMatches) continue;

      // Применяем модификаторы
      try {
        if (group.modifiers && typeof group.modifiers === 'string') {
          const mods = JSON.parse(group.modifiers) as Array<{
            field?: string;
            type?: string;
            value?: string;
          }>;
          for (const mod of mods) {
            if (mod.type === 'set-primary' && mod.field === 'category' && mod.value) {
              const resolved = CATEGORY_GUID_NAMES[mod.value];
              if (resolved) category = resolved;
            } else if (mod.type === 'set' && mod.field && mod.value) {
              // BSData constraint GUIDs имеют формат xxxxxxxx-xxxx-xxxx-xxxx (с дефисами).
              // Обычные текстовые поля (hidden, name, annotation) дефисов не содержат.
              const isBsdataConstraintGuid = /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/.test(mod.field);
              if (isBsdataConstraintGuid) {
                const parsed = Number(mod.value);
                if (isFinite(parsed)) maxInRoster = parsed;
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  // Шаг 2: статический fallback через DETACHMENT_UNIT_OVERRIDES.
  // Применяется для Chaos Knights (War Dogs + Houndpack Lance) и других фракций,
  // где wh40kAPI не экспортирует top-level entry modifiers из BSData selectionEntry.
  // Применяется поверх динамического пути — если API когда-нибудь добавит эти данные
  // в modifierGroups, оба пути вернут одинаковый результат.
  if (item.id) {
    const overridesForDetachment = DETACHMENT_UNIT_OVERRIDES[detachmentId];
    if (overridesForDetachment) {
      const override = overridesForDetachment[item.id];
      if (override) {
        if (override.category !== undefined) category = override.category;
        if (override.maxInRoster !== undefined) maxInRoster = override.maxInRoster;
      }
    }
  }

  return { category, maxInRoster };
}

// Динамически определяет XOR-группы из modifierGroups, которые возвращает API.
// Паттерн BSData: modifier type="set" field="hidden" value="true" +
//   condition type="atLeast" childId=<id сиблинга в том же контейнере>.
// Если ни у одного дочернего узла нет modifierGroups — возвращает [], и используется CONTAINER_EXCLUSIVE_GROUPS.
// Алгоритм: строим направленный граф «A скрывается при выборе B», находим связные компоненты.
function deriveXorGroups(children: ApiUnitItem[]): string[][] {
  const childIdSet = new Set(children.map(c => c.id).filter((id): id is string => !!id));
  const hiddenWhen = new Map<string, Set<string>>();

  for (const child of children) {
    const id = child.id;
    if (!id || !child.modifierGroups?.length) continue;

    for (const group of child.modifierGroups) {
      let hasHideModifier = false;
      try {
        if (group.modifiers) {
          const mods = JSON.parse(group.modifiers) as Array<{ field?: string; type?: string; value?: string }>;
          hasHideModifier = mods.some(m => m.type === 'set' && m.field === 'hidden' && m.value === 'true');
        }
      } catch { continue; } // некорректный JSON в поле modifiers — пропускаем группу
      if (!hasHideModifier) continue;

      try {
        if (group.conditions) {
          const conds = JSON.parse(group.conditions) as Array<{ childId?: string }>;
          for (const cond of conds) {
            if (cond.childId && childIdSet.has(cond.childId)) {
              if (!hiddenWhen.has(id)) hiddenWhen.set(id, new Set());
              hiddenWhen.get(id)!.add(cond.childId);
            }
          }
        }
      } catch { continue; } // некорректный JSON в поле conditions — пропускаем группу
    }
  }

  if (hiddenWhen.size === 0) return [];

  // Union-find для объединения в связные компоненты (с path compression)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) {
      const root = find(parent.get(x)!);
      parent.set(x, root);
      return root;
    }
    return x;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const [hiddenId, triggerIds] of hiddenWhen) {
    for (const triggerId of triggerIds) unite(hiddenId, triggerId);
  }

  const allIds = new Set([
    ...hiddenWhen.keys(),
    ...[...hiddenWhen.values()].flatMap(s => [...s]),
  ]);
  const components = new Map<string, string[]>();
  for (const id of allIds) {
    const root = find(id);
    if (!components.has(root)) components.set(root, []);
    components.get(root)!.push(id);
  }

  return [...components.values()].filter(g => g.length > 1);
}

// Возвращает true, если скрытая запись разблокируется для указанного детачмента.
// Проверяет modifierGroups: ищет группу с модификатором {field:'hidden', value:'false'}
// и условием {scope:'roster', childId: detachmentId}.
function isUnlockedByDetachment(item: ApiUnitItem, detachmentId: string | undefined): boolean {
  if (!detachmentId || !item.modifierGroups?.length) return false;
  for (const group of item.modifierGroups) {
    let hasUnhideModifier = false;
    try {
      if (group.modifiers && typeof group.modifiers === 'string') {
        const mods = JSON.parse(group.modifiers) as Array<{ field?: string; type?: string; value?: string }>;
        hasUnhideModifier = mods.some(m => m.type === 'set' && m.field === 'hidden' && m.value === 'false');
      }
    } catch { continue; } // некорректный JSON в поле modifiers — пропускаем группу
    if (!hasUnhideModifier) continue;
    try {
      if (group.conditions && typeof group.conditions === 'string') {
        const conds = JSON.parse(group.conditions) as Array<{ scope?: string; childId?: string }>;
        if (conds.some(c => c.scope === 'roster' && c.childId === detachmentId)) return true;
      }
    } catch { continue; } // некорректный JSON в поле conditions — пропускаем группу
  }
  return false;
}

// Возвращает true, если узел является промежуточным контейнером (не unit/model/upgrade).
// API wh40kcards.ru исторически использовал entryType=null, а после обновления — entryType="selectionEntryGroup".
// Оба варианта нужно обрабатывать одинаково: рекурсировать вглубь дочерних узлов.
function isContainerItem(item: ApiUnitItem): boolean {
  return (!item.entryType || item.entryType === 'selectionEntryGroup')
    && item.children != null
    && Array.isArray(item.children)
    && item.children.length > 0;
}

export async function getUnits(factionId: string, detachmentId?: string): Promise<Unit[]> {
  try {
    // Загружаем дерево юнитов и условия детачментов параллельно.
    // Условия детачментов: wh40kAPI разбирает entryLink-модификаторы из BSData .cat-файлов
    // и возвращает карту unitId → detachmentIds[] для юнитов, скрытых по умолчанию.
    // Пока wh40kAPI не реализовал этот эндпоинт, возвращается [] и используется
    // статический DETACHMENT_EXCLUSIVE_UNITS как резервный источник данных.
    const [data, serverConditions] = await Promise.all([
      fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/unitsTree`).then(r => {
        if (!r.ok) throw new Error('Failed to fetch units');
        return r.json();
      }),
      getUnitDetachmentConditions(factionId),
    ]);

    // Строим итоговую карту условий: сначала данные от wh40kAPI, затем дополняем статическим fallback.
    // wh40kAPI является основным источником (BSData данные); DETACHMENT_EXCLUSIVE_UNITS — запасной.
    const detachmentMap: Record<string, string[]> = {};
    for (const cond of serverConditions) {
      if (cond.unitId) detachmentMap[cond.unitId] = cond.detachmentIds;
    }
    for (const [unitId, detIds] of Object.entries(DETACHMENT_EXCLUSIVE_UNITS)) {
      if (!detachmentMap[unitId]) detachmentMap[unitId] = detIds;
    }

    // Собираем отряды уровня «корень фракции»: узлы типа "unit" или "model".
    // Работает с двумя форматами ответа API:
    //   — плоский массив: все unit/model имеют parentId === null (текущий формат wh40kcards.ru);
    //   — древовидный формат: unit/model могут быть вложены внутри контейнерных узлов
    //     (категорий типа «HQ», «Battleline» и т.д.) — в таком случае parentId указывает на контейнер.
    //
    // Алгоритм (без проверки parentId):
    //   • Узел unit/model → добавляем в результат, НЕ рекурсируем в его children
    //     (дочерние модели — это состав отряда, не отдельные юниты).
    //   • Узел-контейнер (entryType=null или "selectionEntryGroup", есть children) → рекурсируем.
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
        //   2. Узел-контейнер (selectionEntryGroup или без entryType) с именем, содержащим «allied»
        //   3. catalogueId совпадает с Unaligned Forces
        const isAlliedSection = insideAllied
          || (isContainerItem(node) && node.name?.toLowerCase().includes('allied'))
          || node.catalogueId === UNALIGNED_FORCES_ID;

        if (node.entryType === 'unit' || node.entryType === 'model') {
          // Пропускаем отряды/модели, скрытые по умолчанию и не разблокированные текущим детачментом.
          // (Механизм через modifierGroups в данных wh40kAPI — если API вернул hidden=true с условиями.)
          if (node.hidden === true && !isUnlockedByDetachment(node, detachmentId)) continue;
          // Проверяем карту условий детачментов (данные из BSData .cat-файла или статический fallback).
          // Юнит скрыт, если он есть в карте, но текущий детачмент не входит в список допустимых.
          // Пример: Cultist Firebrand (cb66-af7-2cca-1c85) → только Iconoclast Fiefdom (7fe8-…).
          const allowedDetachments = detachmentMap[node.id ?? ''];
          if (allowedDetachments && (!detachmentId || !allowedDetachments.includes(detachmentId))) continue;
          // Отряд или модель — добавляем в результат.
          // В children находится состав отряда, а не отдельные юниты → не рекурсируем.
          result.push(isAlliedSection ? { ...node, _isAllied: true } : node);
        } else if (isContainerItem(node)) {
          // Контейнерный узел (категория, раздел каталога, selectionEntryGroup) — рекурсируем.
          // Если контейнер скрыт и не разблокирован детачментом — пропускаем его вместе с содержимым.
          if (node.hidden === true && !isUnlockedByDetachment(node, detachmentId)) continue;
          result.push(...collectUnits(node.children!, isAlliedSection));
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
      // null означает «без ограничений» (не 0!), поэтому используем != null вместо !== undefined
      let maxInRoster = item.maxInRoster != null ? toNum(item.maxInRoster) : undefined;

      // Применяем модификаторы детачмента (смена категории, изменение лимита отрядов).
      // Вызывается только для корневых записей (depth=0), т.к. modifierGroups хранятся на юните.
      let category = cats?.find(c => c.primary)?.name ??
        cats?.[0]?.name ??
        item.category ?? item.categoryName ?? item.entryType ?? item.type ?? 'Other';
      if (depth === 0) {
        ({ category, maxInRoster } = applyDetachmentModifiers(item, detachmentId, category, maxInRoster));
      }

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
      // Сохраняем промежуточные контейнеры (entryType=null или "selectionEntryGroup") как узлы дерева,
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
        // «Значимые» контейнеры — только те, у которых есть явные min/maxInRoster.
        // Кампанийные контейнеры (например «Crusade», без ограничений) не учитываются:
        // их наличие не должно блокировать создание синтетического контейнера.
        const directModelChildren = children.filter(c =>
          c.entryType === 'model' && !(c.hidden === true && !isUnlockedByDetachment(c, detachmentId))
        );
        const containerChildren = children.filter(isContainerItem);
        const meaningfulContainerChildren = containerChildren.filter(
          c => c.minInRoster != null || c.maxInRoster != null
        );
        const needSyntheticContainer =
          !isNestedInContainer &&
          parentCostBands &&
          directModelChildren.length >= 2 &&
          meaningfulContainerChildren.length === 0;

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
          // Пропускаем записи, скрытые по умолчанию, если они не разблокированы текущим детачментом.
          // Поле hidden появилось в /unitsTree после обновления wh40kAPI.
          if (child.hidden === true && !isUnlockedByDetachment(child, detachmentId)) continue;

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
          } else if (child.entryType === 'upgrade' && child.hidden === true) {
            // upgrade-запись, разблокированная детачментом (hidden=true прошла проверку выше).
            // Добавляем как дополнительную запись юнита (аналогично модели).
            const upgradeUnit = mapItem(child, depth + 1);
            const minCount = child.minInRoster !== undefined ? toNum(child.minInRoster) : undefined;
            result.push(minCount !== undefined ? { ...upgradeUnit, minCount } : upgradeUnit);
          } else if (isContainerItem(child)) {
            // Промежуточный контейнер (entryType=null или "selectionEntryGroup") — передаём parentCostBands дальше.
            // isNestedInContainer=true запрещает создание синтетического контейнера в рекурсивном вызове,
            // чтобы модели внутри независимых контейнеров (Case 4) не обёртывались лишним слоем.
            const nestedRaw = buildChildTree(child.children!, parentCostBands, true);
            if (nestedRaw.length > 0) {
              // Определяем XOR-группы: сначала пробуем динамически из modifierGroups API,
              // при отсутствии данных — берём из резервной таблицы CONTAINER_EXCLUSIVE_GROUPS.
              const dynamicGroups = deriveXorGroups(child.children ?? []);
              const exclusiveGroupsForContainer =
                dynamicGroups.length > 0 ? dynamicGroups : CONTAINER_EXCLUSIVE_GROUPS[child.id ?? ''];
              const nested = exclusiveGroupsForContainer
                ? nestedRaw.map(m => {
                    for (let gi = 0; gi < exclusiveGroupsForContainer.length; gi++) {
                      if (exclusiveGroupsForContainer[gi].includes(m.id)) {
                        return { ...m, exclusiveGroup: `${child.id}-excl-${gi}` };
                      }
                    }
                    return m;
                  })
                : nestedRaw;
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
          // Остальные типы (upgrade без скрытия, прочие) — пропускаем
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
