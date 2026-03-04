import { useState, useEffect } from 'react';
import type { Unit, UnitGroup, UnitCostBand } from '../types';
import { getUnits, forceImportUnits } from '../services/api';

interface AddUnitModalProps {
  factionId: string;
  factionName: string;
  onClose: () => void;
  onAdd: (unit: Unit) => void;
  attachMode?: boolean;
  remainingPoints?: number;
  // Текущие отряды в ростере — нужны для проверки лимита maxInRoster
  currentUnitGroups?: UnitGroup[];
  allowLegends?: boolean;
}

/** Выбирает ценовой диапазон для указанного количества моделей. */
function bandForCount(bands: UnitCostBand[], count: number): UnitCostBand | undefined {
  return bands.find(b => count >= b.minModels && count <= b.maxModels);
}

export function AddUnitModal({ factionId, factionName, onClose, onAdd, attachMode, remainingPoints, currentUnitGroups, allowLegends }: AddUnitModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Хранит выбранное количество моделей для отрядов с ценовыми диапазонами
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});

  /** Applies fetched unit data to state. */
  const applyUnitsData = (data: Unit[]) => {
    setUnits(data);
    // Инициализируем количество моделей минимальным значением каждого диапазона
    const init: Record<string, number> = {};
    data.forEach(u => {
      if (u.costBands && (u.costBands.length > 1 ||
          (u.costBands.length === 1 && u.costBands[0].minModels !== u.costBands[0].maxModels))) {
        init[u.id] = u.costBands[0].minModels;
      }
    });
    setModelCounts(init);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUnits(factionId)
      .then(data => { if (!cancelled) applyUnitsData(data); })
      .catch(err => console.error('Failed to load units:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [factionId]);

  const handleRefresh = () => {
    setRefreshing(true);
    forceImportUnits(factionId)
      .then(() => getUnits(factionId))
      .then(data => applyUnitsData(data))
      .catch(err => console.error('Failed to refresh unit data:', err))
      .finally(() => setRefreshing(false));
  };

  const filteredUnits = attachMode ? units.filter(u => u.isLeader) : units;

  const visibleUnits = (allowLegends
    ? filteredUnits
    : filteredUnits.filter(u => !u.name.toLowerCase().includes('[legends]'))
  ).filter(u => {
    const cat = u.category?.toLowerCase();
    if (cat === 'other') return false;
    if (cat === 'upgrade') return false;
    if (u.cost == null || u.cost === 0) return false;
    return true;
  });

  const grouped = visibleUnits.reduce<Record<string, Unit[]>>((acc, unit) => {
    if (!acc[unit.category]) acc[unit.category] = [];
    acc[unit.category].push(unit);
    return acc;
  }, {});

  const types = Object.keys(grouped);

  const toggleType = (type: string) => {
    setOpenType(prev => (prev === type ? null : type));
  };

  // Подсчёт количества отрядов данного типа (по id) уже в ростере.
  // Первый элемент группы (units[0]) является основным отрядом и определяет тип группы.
  const countInRoster = (unitId: string): number => {
    if (!currentUnitGroups) return 0;
    return currentUnitGroups.filter(g => g.units.length > 0 && g.units[0].id === unitId).length;
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? visibleUnits.filter(u => u.name.toLowerCase().includes(normalizedQuery))
    : [];

  const renderUnitItem = (unit: Unit) => {
    const hasBands = unit.costBands != null && (
      unit.costBands.length > 1 ||
      (unit.costBands.length === 1 && unit.costBands[0].minModels !== unit.costBands[0].maxModels)
    );
    const selectedCount = hasBands ? (modelCounts[unit.id] ?? unit.costBands![0].minModels) : undefined;
    const activeBand = hasBands ? bandForCount(unit.costBands!, selectedCount!) : undefined;
    const effectiveCost = activeBand?.cost ?? unit.cost;

    const canAdd = remainingPoints === undefined || effectiveCost === undefined || effectiveCost <= remainingPoints;
    const inRoster = countInRoster(unit.id);
    const limitReached = unit.maxInRoster !== undefined && inRoster >= unit.maxInRoster;

    const handleAdd = () => {
      onAdd({ ...unit, cost: effectiveCost, modelCount: selectedCount });
    };

    return (
      <li key={unit.id} className="unit-item">
        <div className="unit-info">
          <span className="unit-name">{unit.name}</span>
          {effectiveCost !== undefined && (
            <span className="unit-cost">{effectiveCost} pts</span>
          )}
        </div>
        {hasBands && (
          <div className="unit-model-count">
            <label className="unit-model-count-label">
              Моделей:
              <select
                className="unit-model-count-select"
                value={selectedCount}
                onChange={e => {
                  const val = Number(e.target.value);
                  setModelCounts(prev => ({ ...prev, [unit.id]: val }));
                }}
              >
                {unit.costBands!.flatMap(band => {
                  const options = [];
                  for (let n = band.minModels; n <= band.maxModels; n++) {
                    options.push(
                      <option key={n} value={n}>
                        {n} ({band.cost} pts)
                      </option>
                    );
                  }
                  return options;
                })}
              </select>
            </label>
          </div>
        )}
        <div className="unit-item-footer">
          {unit.maxInRoster !== undefined && (
            <span className={`unit-roster-count${limitReached ? ' unit-roster-count--limit' : ''}`}>
              {inRoster}/{unit.maxInRoster}
            </span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={!canAdd || limitReached}
            aria-label={attachMode ? 'Присоединить' : 'Добавить'}
          >
            +
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{attachMode ? `Присоединить лидера — ${factionName}` : `Добавить отряд — ${factionName}`}</h2>
          <div className="modal-header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              title="Обновить данные отрядов с сервера"
            >
              {refreshing ? '⏳' : '🔄'}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-search">
          <input
            className="form-input"
            type="search"
            placeholder="Поиск отряда..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading">Загрузка отрядов...</div>
          ) : normalizedQuery ? (
            searchResults.length === 0 ? (
              <div className="empty-state"><p>Отряды не найдены</p></div>
            ) : (
              <ul className="accordion-body accordion-body--search">
                {searchResults.map(renderUnitItem)}
              </ul>
            )
          ) : types.length === 0 ? (
            <div className="empty-state"><p>Отряды не найдены</p></div>
          ) : (
            <div className="accordion">
              {types.map(type => (
                <div key={type} className="accordion-item">
                  <button
                    className={`accordion-header ${openType === type ? 'open' : ''}`}
                    onClick={() => toggleType(type)}
                  >
                    <span>{type}</span>
                    <span className="accordion-count">{grouped[type].length}</span>
                    <span className="accordion-chevron">{openType === type ? '▲' : '▼'}</span>
                  </button>
                  {openType === type && (
                    <ul className="accordion-body">
                      {grouped[type].map(renderUnitItem)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
