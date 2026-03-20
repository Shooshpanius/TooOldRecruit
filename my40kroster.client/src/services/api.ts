import type { Faction, Unit, UnitCostBand, UnitProfile, UnitWeapon } from '../types';

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
  // Upgrade-дочерние записи с ограничениями minInRoster > 0 и детачмент-условием.
  // Добавлено в ответ /fractions/{id}/unitsTree после обновления wh40kAPI (коммит e28e595).
  // Заполняется для записей типа "model", у которых есть upgrade-дети, скрытые без определённого детачмента.
  // Пример: War Dog → [{name:"Houndpack Lance Character", minInRoster:3, maxInRoster:3, requiredDetachmentId:"6cb5..."}]
  requiredUpgrades?: Array<{
    id?: string;
    name?: string;
    minInRoster?: number | null;
    maxInRoster?: number | null;
    requiredDetachmentId?: string | null;
  }>;
  // Профили BSData: характеристики юнита/оружия (добавлено в unitsTree после задания wh40kAPI).
  // typeName="Unit" → M/T/Sv/W/Ld/OC; typeName contains "Weapons" → Range/A/BS|WS/S/AP/D.
  profiles?: Array<{
    id?: string;
    name?: string;
    typeName?: string;
    characteristics?: string; // JSON string
  }>;
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

// Статическая карта «собственных» каталогов для «библиотечных» фракций — тех, у которых
// основной .cat-файл не содержит юнитов напрямую, а использует связанные библиотечные
// каталоги через importRootEntries="true".
//
// Ключ   — BSData GUID основного каталога фракции (id из /fractions).
// Значение — массив BSData GUID каталогов, связанных через importRootEntries="true".
//
// Юниты из «собственных» каталогов НЕ являются «союзными» (Allied) — они основная часть
// фракции. «Союзными» считаются только юниты из каталогов, связанных БЕЗ importRootEntries
// (через явные entryLinks с условиями детачмента, например Chaos Space Marines в CK).
//
// Источник: <catalogueLinks> в *.cat-файлах репозитория github.com/BSData/wh40k-10e
// Используется как резервный источник на случай недоступности эндпоинта
// GET /fractions/{id}/ownCatalogues (Shooshpanius/wh40kAPI@2ea5612).
const FACTION_OWN_CATALOGUE_IDS: Record<string, string[]> = {
  // ── Chaos - Chaos Knights (46d8-abc8-ef3a-9f85) ──────────────────────────
  // catalogueLinks с importRootEntries="true":
  '46d8-abc8-ef3a-9f85': [
    '8106-aad2-918a-9ac', // Chaos - Chaos Knights Library
    'b45c-af22-788a-dfd6', // Chaos - Daemons Library
    '7481-280e-b55e-7867', // Library - Titans
  ],
  // ── Imperium - Imperial Knights (25dd-7aa0-6bf4-f2d5) ────────────────────
  // catalogueLinks с importRootEntries="true":
  '25dd-7aa0-6bf4-f2d5': [
    '1b6d-dc06-5db9-c7d1', // Imperium - Imperial Knights - Library
    'b00-cd86-4b4c-97ba', // Imperium - Agents of the Imperium
    '7481-280e-b55e-7867', // Library - Titans
  ],
};

// Каталоги, которые для данной фракции всегда считаются Allied (союзными),
// даже если wh40kAPI возвращает их в составе «собственных» каталогов через
// importRootEntries="true". Используется для фракций, у которых связанные
// библиотеки являются именно союзными контингентами, а не ядром фракции.
//
// Ключ   — BSData GUID основного каталога фракции.
// Значение — массив catalogueId, принудительно исключаемых из ownCatalogueIds.
const FACTION_ALLIED_CATALOGUE_IDS: Record<string, string[]> = {
  // ── Imperium - Adeptus Mechanicus (77b9-2f66-3f9b-5cf3) ──────────────────
  // BSData содержит importRootEntries="true" для этих ссылок, однако
  // юниты из данных каталогов являются союзными для AM, а не частью фракции:
  //   • IK Library — Cerastus Knights (Acheron/Atrapos/Castigator/Lancer)
  //     являются Questor Mechanicus, т.е. рыцарями, присягнувшими AM, но
  //     остающимися Allied, а не core-отрядами AM.
  //   • Agents of the Imperium и Titans — аналогично Allied контингенты.
  // Источник: Imperium - Adeptus Mechanicus.cat (github.com/BSData/wh40k-10e)
  '77b9-2f66-3f9b-5cf3': [
    '1b6d-dc06-5db9-c7d1', // Imperium - Imperial Knights - Library (Cerastus Knights)
    'b00-cd86-4b4c-97ba',  // Imperium - Agents of the Imperium
    '7481-280e-b55e-7867', // Library - Titans
  ],
};

// Загружает список «собственных» каталогов фракции через прокси-эндпоинт
// GET /api/bsdata/fractions/{id}/own-catalogues → wh40kAPI GET /fractions/{id}/ownCatalogues.
// «Собственные» каталоги — это каталог фракции плюс все каталоги, связанные через
// importRootEntries="true" в BSData (рекурсивно). Реализовано в Shooshpanius/wh40kAPI@2ea5612.
// При ошибке сети или ответе не-2xx возвращает null, и вызывающий код
// использует FACTION_OWN_CATALOGUE_IDS как резервный источник.
async function fetchOwnCatalogueIds(factionId: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/own-catalogues`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return new Set(data as string[]);
    }
    return null;
  } catch {
    return null;
  }
}

// Карта BSData GUID категорий → отображаемое имя.
// Используется при разрешении модификаторов типа set-primary category, которые ссылаются
// на BSData ID записи категории (categoryEntry), а не на текстовое имя.
const CATEGORY_GUID_NAMES: Record<string, string> = {
  'e338-111e-d0c6-b687': 'Battleline',
};

// Возвращает результирующие category, maxInRoster и minInRoster для узла с учётом активного детачмента.
// Обрабатывает modifierGroups с условием scope="force"|"roster" childId=detachmentId.
// wh40kAPI экспортирует как <modifierGroup>, так и top-level <modifier> элементы selectionEntry
// в виде modifierGroups (начиная с коммита Shooshpanius/wh40kAPI@1d56b37).
// Поддерживаемые модификаторы:
//   • type="set-primary" field="category" — смена категории (value — BSData GUID из CATEGORY_GUID_NAMES);
//   • type="set" field=<GUID> value=<число> — замена maxInRoster (field — ID ограничения BSData);
//   • type="set-min" field=<GUID> value=<число> — замена minInRoster (когда wh40kAPI начнёт различать
//     min/max ограничения по типу; пока API возвращает только type="set" для обоих типов).
function applyDetachmentModifiers(
  item: ApiUnitItem,
  detachmentId: string | undefined,
  currentCategory: string,
  currentMaxInRoster: number | undefined,
  currentMinInRoster: number | undefined,
): { category: string; maxInRoster: number | undefined; minInRoster: number | undefined } {
  if (!detachmentId) {
    return { category: currentCategory, maxInRoster: currentMaxInRoster, minInRoster: currentMinInRoster };
  }

  let category = currentCategory;
  let maxInRoster = currentMaxInRoster;
  let minInRoster = currentMinInRoster;

  // Динамический путь через modifierGroups: применяем группы с условием scope="force"|"roster" childId=detachmentId.
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
            } else if ((mod.type === 'set' || mod.type === 'set-max') && mod.field && mod.value) {
              // BSData constraint GUIDs имеют формат xxxxxxxx-xxxx-xxxx-xxxx (с дефисами).
              // Обычные текстовые поля (hidden, name, annotation) дефисов не содержат.
              // type="set" — текущий формат wh40kAPI (не различает min/max ограничения);
              // type="set-max" — перспективный формат после доработки wh40kAPI (явный max-constraint).
              // Оба типа трактуются как maxInRoster: исторически type="set" с GUID-полем
              // использовался только для max-ограничений (min-ограничения ещё не экспортировались).
              const isBsdataConstraintGuid = /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/.test(mod.field);
              if (isBsdataConstraintGuid) {
                const parsed = Number(mod.value);
                if (isFinite(parsed)) maxInRoster = parsed;
              }
            } else if (mod.type === 'set-min' && mod.field && mod.value) {
              // Явный тип "set-min" — изменение минимального ограничения.
              // Ожидается после того, как wh40kAPI начнёт различать min/max constraint type.
              // Сейчас (до доработки wh40kAPI) этот путь никогда не срабатывает.
              const isBsdataConstraintGuid = /^[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/.test(mod.field);
              if (isBsdataConstraintGuid) {
                const parsed = Number(mod.value);
                if (isFinite(parsed)) minInRoster = parsed;
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  return { category, maxInRoster, minInRoster };
}

// Возвращает true, если узел должен быть скрыт при текущем детачменте.
// Применяется к записям, которые по умолчанию видимы (hidden: false), но содержат
// модификатор hidden=true с условием "данного детачмента нет в ростере" (type=lessThan, value=1).
// Паттерн BSData: modifier[type=set, field=hidden, value=true] + condition[type=lessThan, scope=roster, childId=<detachmentId>].
// Смысл: запись скрывается, если указанный детачмент НЕ выбран.
// Пример: "Houndpack Lance Character" скрывается без Houndpack Lance (6cb5-45cf-c626-fa86).
function isHiddenByDetachment(item: ApiUnitItem, detachmentId: string | undefined): boolean {
  if (!item.modifierGroups?.length) return false;
  for (const group of item.modifierGroups) {
    let hasHideModifier = false;
    try {
      if (group.modifiers && typeof group.modifiers === 'string') {
        const mods = JSON.parse(group.modifiers) as Array<{ field?: string; type?: string; value?: string }>;
        hasHideModifier = mods.some(m => m.type === 'set' && m.field === 'hidden' && m.value === 'true');
      }
    } catch { continue; } // некорректный JSON в поле modifiers — пропускаем группу
    if (!hasHideModifier) continue;

    try {
      if (group.conditions && typeof group.conditions === 'string') {
        const conds = JSON.parse(group.conditions) as Array<{
          scope?: string;
          type?: string;
          childId?: string;
          field?: string;
        }>;
        for (const c of conds) {
          // Условие: "записей с childId в ростере меньше 1" → скрыть, если детачмент не выбран
          if (
            c.type === 'lessThan' &&
            c.scope === 'roster' &&
            c.field === 'selections' &&
            c.childId
          ) {
            // Если текущий детачмент НЕ совпадает с условием → запись должна быть скрыта
            if (detachmentId !== c.childId) return true;
          }
        }
      }
    } catch { continue; } // некорректный JSON в поле conditions — пропускаем группу
  }
  return false;
}

// Возвращает ID детачмента, при выборе которого данная запись становится видимой,
// или null если запись не имеет детачмент-условного скрытия.
// Паттерн BSData: modifier[type=set, field=hidden, value=true] + condition[type=lessThan, scope=roster, childId=detachmentId].
// Смысл: запись скрыта, когда указанный детачмент НЕ выбран в ростере.
// Пример: "Houndpack Lance Character" скрывается без Houndpack Lance (6cb5-45cf-c626-fa86),
// значит функция вернёт "6cb5-45cf-c626-fa86".
function getRequiredDetachmentId(item: ApiUnitItem): string | null {
  if (!item.modifierGroups?.length) return null;
  for (const group of item.modifierGroups) {
    let hasHideModifier = false;
    try {
      if (group.modifiers && typeof group.modifiers === 'string') {
        const mods = JSON.parse(group.modifiers) as Array<{ field?: string; type?: string; value?: string }>;
        hasHideModifier = mods.some(m => m.type === 'set' && m.field === 'hidden' && m.value === 'true');
      }
    } catch { continue; } // некорректный JSON в поле modifiers — пропускаем группу
    if (!hasHideModifier) continue;
    try {
      if (group.conditions && typeof group.conditions === 'string') {
        const conds = JSON.parse(group.conditions) as Array<{
          scope?: string;
          type?: string;
          childId?: string;
          field?: string;
        }>;
        for (const c of conds) {
          if (c.type === 'lessThan' && c.scope === 'roster' && c.field === 'selections' && c.childId) {
            return c.childId;
          }
        }
      }
    } catch { continue; } // некорректный JSON в поле conditions — пропускаем группу
  }
  return null;
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
    // Загружаем дерево юнитов, условия детачментов и собственные каталоги параллельно.
    // Условия детачментов: wh40kAPI разбирает entryLink-модификаторы из BSData .cat-файлов
    // и возвращает карту unitId → detachmentIds[] для юнитов, скрытых по умолчанию.
    // Пока wh40kAPI не реализовал этот эндпоинт, возвращается [] и используется
    // статический DETACHMENT_EXCLUSIVE_UNITS как резервный источник данных.
    //
    // Собственные каталоги: wh40kAPI возвращает список catalogueId, связанных через
    // importRootEntries="true" — юниты из них являются основной частью фракции, а не Allied.
    // Реализовано в wh40kAPI@2ea5612; при ошибке используется FACTION_OWN_CATALOGUE_IDS.
    const [data, serverConditions, serverOwnCatalogues] = await Promise.all([
      fetch(`${WH40K_API}/fractions/${encodeURIComponent(factionId)}/unitsTree`).then(r => {
        if (!r.ok) throw new Error('Failed to fetch units');
        return r.json();
      }),
      getUnitDetachmentConditions(factionId),
      fetchOwnCatalogueIds(factionId),
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

    // Строим множество «собственных» catalogueId для фракции.
    // «Собственные» каталоги — это сам каталог фракции плюс все каталоги, связанные через
    // importRootEntries="true" в BSData (рекурсивно). Юниты из них НЕ являются Allied.
    // «Союзными» считаются юниты из каталогов, связанных без importRootEntries (via entryLinks
    // с условиями детачмента), например Chaos Space Marines в составе Chaos Knights,
    // а также каталоги из FACTION_ALLIED_CATALOGUE_IDS — принудительно Allied вне зависимости
    // от importRootEntries (например, Cerastus Knights для Adeptus Mechanicus).
    //
    // Источник: wh40kAPI /own-catalogues (основной) → FACTION_OWN_CATALOGUE_IDS (fallback).
    // После построения применяется FACTION_ALLIED_CATALOGUE_IDS: каталоги из него удаляются
    // из множества «собственных», даже если API вернул их таковыми.
    const ownCatalogueIds: Set<string> = (() => {
      const base = serverOwnCatalogues ?? (() => {
        const result = new Set<string>([factionId]);
        const staticOwn = FACTION_OWN_CATALOGUE_IDS[factionId];
        if (staticOwn) staticOwn.forEach(id => result.add(id));
        return result;
      })();
      const alwaysAllied = FACTION_ALLIED_CATALOGUE_IDS[factionId];
      if (alwaysAllied) alwaysAllied.forEach(id => base.delete(id));
      return base;
    })();

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
    // (catalogueId отсутствует в множестве собственных каталогов фракции).
    function collectUnits(nodes: ApiUnitItem[], insideAllied = false): ApiUnitItem[] {
      const result: ApiUnitItem[] = [];
      for (const node of nodes) {
        // Определяем: является ли текущий узел или его контекст разделом «союзных» юнитов.
        // Критерии:
        //   1. Уже находимся внутри Allied-раздела (флаг от родителя)
        //   2. catalogueId узла определён и не входит в множество собственных каталогов фракции
        //      (ownCatalogueIds = {factionId} ∪ {каталоги с importRootEntries="true"})
        const isAlliedSection = insideAllied
          || (node.catalogueId != null && !ownCatalogueIds.has(node.catalogueId));

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
      const isTopLevel = depth === 0;
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
      // minInRoster из API: минимальное количество данного типа в ростере (может быть задано детачментом)
      let minInRoster = item.minInRoster != null ? toNum(item.minInRoster) : undefined;

      // Применяем модификаторы детачмента (смена категории, изменение лимитов отрядов).
      // Вызывается только для корневых записей (depth=0), т.к. modifierGroups хранятся на юните.
      let category = cats?.find(c => c.primary)?.name ??
        cats?.[0]?.name ??
        item.category ?? item.categoryName ?? item.entryType ?? item.type ?? 'Other';
      if (isTopLevel) {
        ({ category, maxInRoster, minInRoster } = applyDetachmentModifiers(item, detachmentId, category, maxInRoster, minInRoster));

        // Дополнительный источник minInRoster — поле requiredUpgrades из wh40kAPI (коммит e28e595).
        // Для записей типа "model" (например War Dog), у которых upgrade-дочерние записи имеют
        // roster-wide min-ограничение при определённом детачменте, wh40kAPI возвращает
        // requiredUpgrades вместо обычных modifierGroups, т.к. children у "model" не обрабатывает buildChildTree.
        // minInRoster здесь — это фактически «минимальное количество отрядов данного типа в ростере»
        // (следствие: если нужно 3 из них с Houndpack Lance Character, то нужно минимум 3 таких отряда).
        if (detachmentId && item.requiredUpgrades?.length) {
          const matchingUpgrade = item.requiredUpgrades.find(
            u => u.requiredDetachmentId === detachmentId
          );
          if (matchingUpgrade?.minInRoster != null) {
            const reqMin = Number(matchingUpgrade.minInRoster);
            if (isFinite(reqMin) && reqMin > 0) {
              minInRoster = Math.max(minInRoster ?? 0, reqMin);
            }
          }
        }
      }

      // Извлекаем детачмент-зависимые апгрейды из дочерних записей (только на корневом уровне).
      // Апгрейд является «детачмент-зависимым», если у него есть модификатор скрытия с условием
      // «данного детачмента нет в ростере» (type=lessThan, scope=roster, childId=<detachmentId>)
      // и текущий выбранный детачмент совпадает с этим условием (т.е. апгрейд сейчас видим).
      // Пример: «Houndpack Lance Character» у War Dog при Houndpack Lance.
      // Такие апгрейды отображаются как чекбоксы на карточке отряда в ростере.
      let detachmentUpgrades: Array<{ id: string; name: string; minInRoster?: number; maxInRoster?: number }> | undefined;
      if (isTopLevel && detachmentId && Array.isArray(item.children)) {
        const extracted = item.children
          .filter(child =>
            child.entryType === 'upgrade' &&
            child.hidden !== true &&
            getRequiredDetachmentId(child) === detachmentId
          )
          .map(child => ({
            id: child.id ?? child.name ?? '',
            name: child.name ?? '',
            minInRoster: child.minInRoster != null ? toNum(child.minInRoster) : undefined,
            maxInRoster: child.maxInRoster != null ? toNum(child.maxInRoster) : undefined,
          }));
        if (extracted.length > 0) {
          detachmentUpgrades = extracted;
          // minInRoster для юнита — максимальное из roster-wide min-ограничений апгрейдов.
          // Семантика: чтобы взять N обязательных апгрейдов, нужно минимум N таких отрядов.
          // Применяется только если requiredUpgrades не уже задал minInRoster.
          const upgradeMin = extracted.reduce((m, u) => Math.max(m, u.minInRoster ?? 0), 0);
          if (upgradeMin > 0) {
            minInRoster = Math.max(minInRoster ?? 0, upgradeMin);
          }
        }
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
          // Пропускаем видимые по умолчанию записи, которые должны быть скрыты при текущем детачменте.
          // Паттерн: запись hidden=false + modifier[hidden=true, condition lessThan 1 of detachment].
          // Пример: "Houndpack Lance Character" скрыт без Houndpack Lance.
          if (child.hidden !== true && isHiddenByDetachment(child, detachmentId)) continue;

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
          // Остальные типы (upgrade без скрытия и без детачмент-условий, прочие) — пропускаем
        }
        return result;
      }
      const models: Unit[] | undefined = depth === 0 && entryType === 'unit' && Array.isArray(item.children)
        ? buildChildTree(item.children, hasVariableCost ? costBands : undefined)
        : undefined;

      // Извлекаем профили юнита (характеристики M/T/Sv/W/Ld/OC).
      // Появились в /unitsTree после задания wh40kAPI (поле profiles на каждом узле).
      // Берём только profiles с typeName="Unit" — остальные (оружейные) разбираются ниже.
      let unitProfiles: UnitProfile[] | undefined;
      if (isTopLevel && Array.isArray(item.profiles) && item.profiles.length > 0) {
        const parsed = item.profiles
          .filter(p => p.typeName?.toLowerCase() === 'unit')
          .map(p => ({
            name: p.name ?? '',
            typeName: p.typeName ?? '',
            characteristics: p.characteristics ?? '{}',
          }));
        if (parsed.length > 0) unitProfiles = parsed;
      }

      // Извлекаем оружие: дочерние upgrade-узлы с профилями, содержащими weapon-тип.
      // После задания wh40kAPI каждый дочерний узел имеет поле profiles[].
      let unitWeapons: UnitWeapon[] | undefined;
      if (isTopLevel && Array.isArray(item.children) && item.children.length > 0) {
        const weapons: UnitWeapon[] = [];
        for (const child of item.children) {
          if (child.entryType !== 'upgrade') continue;
          if (!Array.isArray(child.profiles) || child.profiles.length === 0) continue;
          const weaponProfiles = child.profiles
            .filter(p => p.typeName?.toLowerCase().includes('weapon'))
            .map(p => ({
              name: p.name ?? child.name ?? '',
              typeName: p.typeName ?? '',
              characteristics: p.characteristics ?? '{}',
            }));
          if (weaponProfiles.length === 0) continue;
          const keywords = (child.infoLinks ?? [])
            .filter(l => l.type === 'rule')
            .map(l => l.name ?? '')
            .filter(Boolean);
          weapons.push({
            id: child.id ?? child.name ?? '',
            name: child.name ?? '',
            keywords,
            profiles: weaponProfiles,
          });
        }
        if (weapons.length > 0) unitWeapons = weapons;
      }

      // Извлекаем ключевые слова: все категории, где primary=false.
      // До обновления wh40kAPI API возвращал только primary-категорию;
      // после обновления возвращает все категории.
      let unitKeywords: string[] | undefined;
      if (isTopLevel) {
        const allCats = item.categories ?? item.unitCategories;
        const kws = (allCats ?? [])
          .filter(c => c.primary === false)
          .map(c => c.name ?? '')
          .filter(Boolean);
        if (kws.length > 0) unitKeywords = kws;
      }

      // Извлекаем имена способностей: infoLinks типа rule на уровне юнита
      // (кроме «Leader», который кодируется отдельным флагом isLeader).
      let unitAbilities: string[] | undefined;
      if (isTopLevel) {
        const abilities = (item.infoLinks ?? [])
          .filter(l => l.type === 'rule' && l.name !== 'Leader')
          .map(l => l.name ?? '')
          .filter(Boolean);
        if (abilities.length > 0) unitAbilities = abilities;
      }

      return {
        id: item.id ?? item.name ?? '',
        name: item.name ?? '',
        category,
        cost,
        isLeader,
        maxInRoster,
        minInRoster,
        costBands: hasVariableCost ? costBands : undefined,
        modelCount: hasVariableCost && costBands ? costBands[0].minModels : undefined,
        hasVariableCost,
        entryType,
        models: models && models.length > 0 ? models : undefined,
        isAllied: item._isAllied === true,
        detachmentUpgrades: detachmentUpgrades && detachmentUpgrades.length > 0 ? detachmentUpgrades : undefined,
        profiles: unitProfiles,
        weapons: unitWeapons,
        keywords: unitKeywords,
        abilities: unitAbilities,
      };
    };

    return items.map(item => mapItem(item));
  } catch (err) {
    console.error('Failed to fetch units from API, using defaults:', err);
    return DEFAULT_UNITS;
  }
}
