import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFactions, getUnits } from '../services/api';
import type { Faction, Unit, UnitProfile } from '../types';

const CATEGORY_ORDER = [
  'Epic Hero',
  'Character',
  'Battleline',
  'Infantry',
  'Mounted',
  'Vehicle',
  'Monster',
  'Fly',
  'Transport',
  'Allied Units',
  'Прочие',
];

export function CatalogPage() {
  const navigate = useNavigate();

  const [factions, setFactions] = useState<Faction[]>([]);
  const [factionsLoading, setFactionsLoading] = useState(true);
  const [factionSearch, setFactionSearch] = useState('');

  const [selectedFaction, setSelectedFaction] = useState<Faction | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // Полные данные по отрядам (с характеристиками), загружаемые в фоне после
  // быстрого отображения списка через облегчённый эндпоинт.
  // Карта: unitId → полный объект Unit с profiles/weapons.
  const [fullUnitsMap, setFullUnitsMap] = useState<Map<string, Unit> | null>(null);
  const [fullUnitsLoading, setFullUnitsLoading] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Load factions on mount
  useEffect(() => {
    setFactionsLoading(true);
    getFactions()
      .then(setFactions)
      .catch(() => setFactions([]))
      .finally(() => setFactionsLoading(false));
  }, []);

  // Load units when faction changes.
  // Этап 1 (быстрый): загружаем облегчённый список через /units-list (без характеристик)
  //   → пользователь видит список отрядов немедленно.
  // Этап 2 (фоновой): параллельно загружаем полные данные через /unitsTree (с характеристиками)
  //   → когда загрузка завершится, детальная карточка обновится автоматически.
  useEffect(() => {
    if (!selectedFaction) {
      setUnits([]);
      setFullUnitsMap(null);
      setSelectedUnit(null);
      return;
    }
    // Флаг отмены для защиты от гонки состояний: если фракция сменилась раньше,
    // чем завершился предыдущий запрос, устаревший ответ не обновит состояние.
    let cancelled = false;

    setUnitsLoading(true);
    setFullUnitsMap(null);
    setFullUnitsLoading(true);
    setSelectedUnit(null);

    // Этап 1: облегчённый список (без profiles)
    getUnits(selectedFaction.id, undefined, { lightweight: true })
      .then(list => { if (!cancelled) setUnits(list); })
      .catch(() => { if (!cancelled) setUnits([]); })
      .finally(() => { if (!cancelled) setUnitsLoading(false); });

    // Этап 2: полные данные в фоне (с profiles/weapons)
    getUnits(selectedFaction.id)
      .then(fullUnits => {
        if (!cancelled) {
          const map = new Map(fullUnits.map(u => [u.id, u]));
          setFullUnitsMap(map);
        }
      })
      .catch(() => { if (!cancelled) setFullUnitsMap(null); })
      .finally(() => { if (!cancelled) setFullUnitsLoading(false); });

    return () => { cancelled = true; };
  }, [selectedFaction]);

  const filteredFactions = useMemo(() => {
    if (!factionSearch.trim()) return factions;
    const q = factionSearch.toLowerCase();
    return factions.filter(f => f.name.toLowerCase().includes(q));
  }, [factions, factionSearch]);

  // Group units by category
  const unitsByCategory = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of units) {
      const cat = u.category || 'Прочие';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(u);
    }
    return map;
  }, [units]);

  const sortedCategories = useMemo(() => {
    const cats = Array.from(unitsByCategory.keys());
    return cats.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [unitsByCategory]);

  return (
    <div className="catalog-page">
      {/* Header */}
      <div className="catalog-header">
        <button onClick={() => navigate('/')} className="btn btn-back">
          ← Назад
        </button>
        <h1 className="catalog-title">📖 Каталог отрядов</h1>
      </div>

      <div className="catalog-layout">
        {/* Left: Factions */}
        <div className="catalog-factions-panel">
          <div className="catalog-panel-title">Фракции</div>
          <input
            className="form-input catalog-search"
            placeholder="Поиск фракции..."
            value={factionSearch}
            onChange={e => setFactionSearch(e.target.value)}
          />
          {factionsLoading ? (
            <div className="loading">Загрузка...</div>
          ) : filteredFactions.length === 0 ? (
            <div className="no-results">Фракции не найдены</div>
          ) : (
            <div className="catalog-faction-list">
              {filteredFactions.map(f => (
                <div
                  key={f.id}
                  className={`catalog-faction-item${selectedFaction?.id === f.id ? ' selected' : ''}`}
                  onClick={() => setSelectedFaction(f)}
                >
                  {f.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Middle: Units */}
        <div className="catalog-units-panel">
          {!selectedFaction ? (
            <div className="catalog-placeholder">
              <span>← Выберите фракцию</span>
            </div>
          ) : unitsLoading ? (
            <div className="loading">Загрузка отрядов...</div>
          ) : units.length === 0 ? (
            <div className="catalog-placeholder">
              <span>Нет данных об отрядах</span>
            </div>
          ) : (
            <div className="catalog-units-list">
              <div className="catalog-panel-title">{selectedFaction.name}</div>
              {sortedCategories.map(cat => (
                <div key={cat} className="catalog-category-group">
                  <div className="catalog-category-header">{cat}</div>
                  {unitsByCategory.get(cat)!.map(unit => (
                    <div
                      key={unit.id}
                      className={`catalog-unit-item${selectedUnit?.id === unit.id ? ' selected' : ''}`}
                      onClick={() => setSelectedUnit(unit)}
                    >
                      <span className="catalog-unit-name">{unit.name}</span>
                      {unit.cost !== undefined && (
                        <span className="catalog-unit-cost">{unit.cost} pts</span>
                      )}
                      {unit.costBands && unit.costBands.length > 0 && unit.cost === undefined && (
                        <span className="catalog-unit-cost">
                          {unit.costBands[0].cost}+ pts
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Unit Detail */}
        <div className="catalog-detail-panel">
          {!selectedUnit ? (
            <div className="catalog-placeholder">
              <span>← Выберите отряд</span>
            </div>
          ) : (
            // Если полные данные уже загружены — показываем полный юнит (с характеристиками).
            // Иначе показываем облегчённый юнит + индикатор загрузки характеристик.
            <UnitDetailCard
              unit={fullUnitsMap?.get(selectedUnit.id) ?? selectedUnit}
              loadingDetail={fullUnitsLoading && !fullUnitsMap?.has(selectedUnit.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Разбирает JSON-строку характеристик (e.g. "{\"M\":\"5\"\"}") в объект.
// Возвращает пустой объект при ошибке.
function parseChars(raw: string): Record<string, string> {
  try { return JSON.parse(raw) as Record<string, string>; }
  catch (_) { return {}; }
}

// Порядок характеристик юнита
const UNIT_STAT_ORDER = ['M', 'T', 'Sv', 'InvSv', 'W', 'Ld', 'OC'];

// Возвращает отсортированные ключи характеристик: сначала известные в нужном порядке, затем остальные.
function sortedCharKeys(chars: Record<string, string>, order: string[]): string[] {
  const keys = Object.keys(chars);
  const known = order.filter(k => k in chars);
  const unknown = keys.filter(k => !order.includes(k));
  return [...known, ...unknown];
}

// Единая таблица профилей: принимает массив профилей одного типа.
// Колонки выводятся в нужном порядке (statOrder).
function ProfileTable({ profiles, statOrder }: { profiles: UnitProfile[]; statOrder: string[] }) {
  if (profiles.length === 0) return null;
  // Собираем все уникальные ключи из всех профилей
  const allChars = profiles.map(p => parseChars(p.characteristics));
  const allKeys = Array.from(new Set(allChars.flatMap(c => Object.keys(c))));
  const cols = sortedCharKeys(Object.fromEntries(allKeys.map(k => [k, ''])), statOrder);
  const multiRow = profiles.length > 1;
  return (
    <table className="unit-stat-table">
      <thead>
        <tr>
          {multiRow && <th>Название</th>}
          {cols.map(k => <th key={k}>{k}</th>)}
        </tr>
      </thead>
      <tbody>
        {profiles.map((p, i) => {
          const chars = parseChars(p.characteristics);
          return (
            <tr key={i}>
              {multiRow && <td>{p.name}</td>}
              {cols.map(k => <td key={k}>{chars[k] ?? '—'}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Unit Detail Card ────────────────────────────────────────────────────────

function UnitDetailCard({ unit, loadingDetail }: { unit: Unit; loadingDetail?: boolean }) {
  return (
    <div className="unit-detail-card">
      {/* Name & Badges */}
      <div className="unit-detail-header">
        <h2 className="unit-detail-name">{unit.name}</h2>
        <div className="unit-detail-badges">
          <span className="unit-detail-category">{unit.category}</span>
          {unit.isLeader && (
            <span className="unit-detail-badge unit-detail-badge--leader">⚔ Лидер</span>
          )}
          {unit.isAllied && (
            <span className="unit-detail-badge unit-detail-badge--allied">Союзник</span>
          )}
        </div>
      </div>

      {/* Unit stats (M/T/Sv/W/Ld/OC) */}
      {unit.profiles && unit.profiles.length > 0 ? (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Характеристики</div>
          <ProfileTable profiles={unit.profiles} statOrder={UNIT_STAT_ORDER} />
        </div>
      ) : loadingDetail ? (
        <div className="unit-detail-section">
          <div className="unit-detail-loading">Загрузка характеристик...</div>
        </div>
      ) : null}

      {/* Points */}
      <div className="unit-detail-section">
        <div className="unit-detail-section-title">Стоимость</div>
        {unit.costBands && unit.costBands.length > 0 ? (
          <table className="unit-stat-table">
            <thead>
              <tr>
                <th>Моделей</th>
                <th>Очков</th>
              </tr>
            </thead>
            <tbody>
              {unit.costBands.map((band, i) => (
                <tr key={i}>
                  <td>
                    {band.minModels}
                    {band.maxModels !== undefined && band.maxModels !== null ? `–${band.maxModels}` : '+'}
                  </td>
                  <td>{band.cost} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : unit.cost !== undefined ? (
          <div className="unit-detail-cost">{unit.cost} pts</div>
        ) : (
          <div className="unit-detail-cost unit-detail-muted">Нет данных</div>
        )}
      </div>

      {/* Weapons */}
      {unit.weapons && unit.weapons.length > 0 ? (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Оружие</div>
          {unit.weapons.map(w => {
            // Определяем набор колонок по первому профилю оружия.
            // В BSData у каждого оружия ровно один профиль (либо Ranged, либо Melee),
            // поэтому смешанных профилей в одном блоке не бывает.
            const firstChars = w.profiles.length > 0 ? parseChars(w.profiles[0].characteristics) : {};
            const isMelee = firstChars['Range']?.toLowerCase() === 'melee';
            const colOrder = isMelee
              ? ['Range', 'A', 'WS', 'S', 'AP', 'D']
              : ['Range', 'A', 'BS', 'S', 'AP', 'D'];
            return (
              <div key={w.id} className="unit-weapon-block">
                <div className="unit-weapon-name">
                  {w.name}
                  {w.keywords.length > 0 && (
                    <span className="unit-weapon-keywords">
                      {w.keywords.join(', ')}
                    </span>
                  )}
                </div>
                <ProfileTable profiles={w.profiles} statOrder={colOrder} />
              </div>
            );
          })}
        </div>
      ) : loadingDetail ? (
        <div className="unit-detail-section">
          <div className="unit-detail-loading">Загрузка оружия...</div>
        </div>
      ) : null}

      {/* Abilities */}
      {unit.abilities && unit.abilities.length > 0 && (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Способности</div>
          <div className="unit-detail-abilities">
            {unit.abilities.map(a => (
              <span key={a} className="unit-ability-tag">{a}</span>
            ))}
          </div>
        </div>
      )}

      {/* Composition */}
      {unit.models && unit.models.length > 0 && (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Состав отряда</div>
          <table className="unit-stat-table">
            <thead>
              <tr>
                <th>Модель</th>
                <th>Мин</th>
                <th>Макс</th>
              </tr>
            </thead>
            <tbody>
              {unit.models.map(m => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.minCount ?? '—'}</td>
                  <td>{m.maxCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roster limits */}
      {(unit.maxInRoster !== undefined || unit.minInRoster !== undefined) && (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Ограничения ростера</div>
          <div className="unit-detail-limits">
            {unit.minInRoster !== undefined && (
              <span>Мин: {unit.minInRoster}</span>
            )}
            {unit.maxInRoster !== undefined && (
              <span>Макс: {unit.maxInRoster}</span>
            )}
          </div>
        </div>
      )}

      {/* Keywords */}
      {unit.keywords && unit.keywords.length > 0 && (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Ключевые слова</div>
          <div className="unit-detail-keywords">
            {unit.keywords.map(kw => (
              <span key={kw} className="unit-keyword-tag">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Detachment upgrades */}
      {unit.detachmentUpgrades && unit.detachmentUpgrades.length > 0 && (
        <div className="unit-detail-section">
          <div className="unit-detail-section-title">Апгрейды детачмента</div>
          <ul className="unit-detail-upgrades">
            {unit.detachmentUpgrades.map(upg => (
              <li key={upg.id}>{upg.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
