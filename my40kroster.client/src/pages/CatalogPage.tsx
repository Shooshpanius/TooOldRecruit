import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFactions, getUnits } from '../services/api';
import type { Faction, Unit } from '../types';

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

  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Load factions on mount
  useEffect(() => {
    setFactionsLoading(true);
    getFactions()
      .then(setFactions)
      .catch(() => setFactions([]))
      .finally(() => setFactionsLoading(false));
  }, []);

  // Load units when faction changes
  useEffect(() => {
    if (!selectedFaction) {
      setUnits([]);
      setSelectedUnit(null);
      return;
    }
    setUnitsLoading(true);
    setSelectedUnit(null);
    getUnits(selectedFaction.id)
      .then(setUnits)
      .catch(() => setUnits([]))
      .finally(() => setUnitsLoading(false));
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
            <UnitDetailCard unit={selectedUnit} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Unit Detail Card ────────────────────────────────────────────────────────

function UnitDetailCard({ unit }: { unit: Unit }) {
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
