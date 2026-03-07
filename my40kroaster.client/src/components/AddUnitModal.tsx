import React, { useState, useEffect } from 'react';
import type { Unit, UnitGroup, UnitCostBand } from '../types';
import { getUnits, UNALIGNED_FORCES_ID } from '../services/api';

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

function getCostForModelCount(bands: UnitCostBand[], count: number): number {
  const band = bands.find(b => count >= b.minModels && count <= b.maxModels);
  return band?.cost ?? bands[0].cost;
}

export function AddUnitModal({ factionId, factionName, onClose, onAdd, attachMode, remainingPoints, currentUnitGroups, allowLegends }: AddUnitModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [openType, setOpenType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getUnits(factionId).then(data => {
      setUnits(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [factionId]);

  const filteredUnits = attachMode ? units.filter(u => u.isLeader) : units;

  const visibleUnits = allowLegends
    ? filteredUnits
    : filteredUnits.filter(u =>
        factionId !== UNALIGNED_FORCES_ID &&
        !u.isAllied &&
        !u.name.toLowerCase().includes('[legends]')
      );

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

  const renderUnitItem = (unit: Unit, depth = 0): React.ReactNode => {
    const isNested = depth > 0;

    // Промежуточный контейнер (entryType не задан, есть дочерние узлы) — рендерим как аккордеон
    if (unit.entryType === undefined && unit.models && unit.models.length > 0) {
      return (
        <li key={unit.id} className="unit-container-group">
          <details className="unit-container-details">
            <summary className="unit-container-label">— {unit.name}</summary>
            <ul className="unit-nested-models">
              {unit.models.map(child => renderUnitItem(child, depth + 1))}
            </ul>
          </details>
        </li>
      );
    }

    // Показываем элементы управления количеством моделей только для записей entryType="model",
    // если есть несколько диапазонов стоимости ИЛИ единственный диапазон допускает разное количество (min < max).
    const hasBands = unit.entryType === 'model' && !!(unit.costBands && unit.costBands.length >= 1 &&
      (unit.costBands.length > 1 || (unit.costBands[0]?.minModels ?? 0) < (unit.costBands[0]?.maxModels ?? 0)));
    const minModels = hasBands ? unit.costBands![0].minModels : 1;
    const maxModels = hasBands ? unit.costBands![unit.costBands!.length - 1].maxModels : 1;
    const modelCount = hasBands ? (modelCounts[unit.id] ?? minModels) : unit.modelCount;
    const displayCost = hasBands && modelCount !== undefined
      ? getCostForModelCount(unit.costBands!, modelCount)
      : unit.cost;

    const setCount = (val: number) => {
      const clamped = Math.min(maxModels, Math.max(minModels, val));
      setModelCounts(prev => ({ ...prev, [unit.id]: clamped }));
    };

    const canAdd = remainingPoints === undefined || displayCost === undefined || displayCost <= remainingPoints;
    const inRoster = countInRoster(unit.id);
    const limitReached = unit.maxInRoster !== undefined && inRoster >= unit.maxInRoster;
    return (
      <li key={unit.id} className={`unit-item${isNested ? ' unit-item--nested' : ''}`}>
        <div className="unit-item-top">
          <div className="unit-info">
            <span className="unit-name">
              {unit.name}
              {unit.entryType === 'unit' && <span className="unit-type-badge">[U]</span>}
              {unit.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
            </span>
            {displayCost !== undefined && (
              <span className="unit-cost">{displayCost} pts</span>
            )}
          </div>
          {!isNested && (
            <div className="unit-item-footer">
              {unit.maxInRoster !== undefined && (
                <span className={`unit-roster-count${limitReached ? ' unit-roster-count--limit' : ''}`}>
                  {inRoster}/{unit.maxInRoster}
                </span>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onAdd({ ...unit, cost: displayCost, modelCount: hasBands ? (modelCounts[unit.id] ?? minModels) : undefined })}
                disabled={!canAdd || limitReached}
                aria-label={attachMode ? 'Присоединить' : 'Добавить'}
              >
                +
              </button>
            </div>
          )}
        </div>
        {hasBands && (
          <div className="unit-model-count">
            <span className="unit-model-count-label">Моделей:</span>
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => setCount((modelCounts[unit.id] ?? minModels) - 1)}
              disabled={(modelCounts[unit.id] ?? minModels) <= minModels}
              aria-label="Уменьшить количество моделей"
            >−</button>
            <input
              type="number"
              className="unit-model-count-input"
              value={modelCounts[unit.id] ?? minModels}
              min={minModels}
              max={maxModels}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setCount(val);
              }}
              aria-label="Количество моделей"
            />
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => setCount((modelCounts[unit.id] ?? minModels) + 1)}
              disabled={(modelCounts[unit.id] ?? minModels) >= maxModels}
              aria-label="Увеличить количество моделей"
            >+</button>
          </div>
        )}
        {!isNested && unit.entryType === 'unit' && unit.models && unit.models.length > 0 && (
          <ul className="unit-nested-models">
            {unit.models.map(child => renderUnitItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{attachMode ? `Присоединить лидера — ${factionName}` : `Добавить отряд — ${factionName}`}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
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
                {searchResults.map(u => renderUnitItem(u))}
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
                      {grouped[type].map(u => renderUnitItem(u))}
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
