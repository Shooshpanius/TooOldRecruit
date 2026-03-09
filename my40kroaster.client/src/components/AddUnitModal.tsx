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

// Рекурсивно ищет первый дочерний [M] с диапазонами стоимости (через промежуточные контейнеры)
function findChildModelWithBands(models?: Unit[]): Unit | undefined {
  if (!models) return undefined;
  for (const m of models) {
    if (m.entryType === 'model' && m.costBands && m.costBands.length >= 1 &&
      (m.costBands.length > 1 || (m.costBands[0]?.minModels ?? 0) < (m.costBands[0]?.maxModels ?? 0))) {
      return m;
    }
    const found = findChildModelWithBands(m.models);
    if (found) return found;
  }
  return undefined;
}

// Ищет контейнерный узел с несколькими типами моделей и ограничением по суммарному количеству
function findMultiModelContainer(models?: Unit[]): Unit | undefined {
  if (!models) return undefined;
  for (const m of models) {
    if (m.entryType === undefined && m.models && m.models.length > 0 &&
      (m.minCount !== undefined || m.maxCount !== undefined)) {
      return m;
    }
  }
  return undefined;
}

// Наибольший общий делитель (алгоритм Евклида)
function gcd(a: number, b: number): number {
  while (b !== 0) { const temp = b; b = a % b; a = temp; }
  return a;
}

// Определяет «период» ограничения: perModels — размер группы (например, 5 для "1 на 5"),
// perCount — сколько моделей данного типа разрешено на одну группу (например, 3 для "3 на 5").
// Пример: maxInRoster=2, maxUnitSize=10 → gcd=2 → perModels=5, perCount=1 ("1 на 5").
// Пример: maxInRoster=6, maxUnitSize=10 → gcd=2 → perModels=5, perCount=3 ("3 на 5").
// Пример: maxInRoster=1, maxUnitSize=10 → gcd=1 → perModels=10, perCount=1 ("1 на 10" = мин-размер).
function getPerGroup(modelMaxInRoster: number, maxUnitSize: number): { perModels: number; perCount: number } {
  const g = gcd(modelMaxInRoster, maxUnitSize);
  return { perModels: maxUnitSize / g, perCount: modelMaxInRoster / g };
}

// Определяет, является ли модель «только при минимальном размере отряда»:
// период > половины максимального отряда означает, что правило "1 на N" срабатывает
// только для минимального состава (например, plague spewer and CCW: "1 на 10" при maxUnitSize=10).
function isMinSizeOnlyModel(modelMaxInRoster: number | undefined, maxUnitSize: number): boolean {
  if (modelMaxInRoster === undefined) return false;
  const { perModels } = getPerGroup(modelMaxInRoster, maxUnitSize);
  return perModels > maxUnitSize / 2;
}

// Определяет, является ли модель «ведущей» — не зависит от числа других моделей через правило 1:N.
// Ведущие модели отображаются вверху списка.
// Модели «только при минимальном размере» считаются ведущими (например, plague spewer and CCW).
// Модели «perCount на каждые perModels» — зависимые (secondary), например flail, combi-weapon.
function isPrimaryContainerModel(modelMaxInRoster: number | undefined, maxUnitSize: number, minUnitSize?: number): boolean {
  if (modelMaxInRoster === undefined) return true;
  const { perModels } = getPerGroup(modelMaxInRoster, maxUnitSize);
  if (perModels > 1) {
    // Модели «только при минимальном размере» считаются ведущими
    if (minUnitSize !== undefined && perModels > maxUnitSize / 2) return true;
    return false; // Зависимые (1-per-N, 3-per-5 и т.д.) — secondary
  }
  return true;
}

// Вычисляет эффективный максимум для одного типа модели с учётом суммарного ограничения.
// Использует НОД-формулу для любого дробного соотношения maxInRoster/maxUnitSize:
//   effectiveMax = floor(totalCount / perModels) * perCount
// Специальные случаи:
//   1. «Только при минимальном размере» (perModels > maxUnitSize/2):
//      доступна лишь когда totalCount <= minUnitSize, иначе 0.
//   2. Стандартное правило «perCount на каждые perModels»:
//      effectiveMax = floor(totalCount / perModels) * perCount.
// maxTotal — эффективный максимум контейнера (может быть уменьшен до minContainer,
// если в отряде выбрана модель «только при минимальном размере»).
function calcEffectiveMax(
  modelMaxInRoster: number | undefined,
  maxTotal: number,
  otherTotal: number,
  totalCount?: number,
  maxUnitSize?: number,
  minUnitSize?: number,
): number {
  if (modelMaxInRoster !== undefined && totalCount !== undefined && maxUnitSize !== undefined) {
    const { perModels, perCount } = getPerGroup(modelMaxInRoster, maxUnitSize);
    if (perModels > 1) {
      // Модель «только при минимальном размере»
      if (perModels > maxUnitSize / 2 && minUnitSize !== undefined) {
        if (totalCount > minUnitSize) return 0;
        return Math.min(modelMaxInRoster, maxTotal - otherTotal);
      }
      // Правило «perCount на каждые perModels моделей» (1-per-5, 3-per-5 и т.д.)
      const allowedByRatio = Math.min(Math.floor(totalCount / perModels) * perCount, modelMaxInRoster);
      return Math.min(allowedByRatio, maxTotal - otherTotal);
    }
  }
  return Math.min(modelMaxInRoster ?? maxTotal, maxTotal - otherTotal);
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

    // Случай: отряд [U] с несколькими типами моделей (например, Ironstrider Ballistarii)
    // — контейнерный узел задаёт суммарный min/max, каждый [M] имеет фиксированную стоимость
    // Если у [U] есть собственные costBands (Poxwalkers-подобный), пропускаем этот случай
    const multiContainerForAll = !isNested && unit.entryType === 'unit'
      ? findMultiModelContainer(unit.models)
      : undefined;

    // Случай 3: Blightlord-подобный — несколько типов моделей + стоимость по costBands на [U]
    // Отличие от Ironstrider: стоимость определяется по суммарному числу моделей через costBands, а не по сумме индивидуальных стоимостей
    // Отличие от Poxwalkers (Case 2): в контейнере несколько разных типов моделей
    if (multiContainerForAll && unit.costBands?.length && (multiContainerForAll.models?.length ?? 0) > 1) {
      const containerModels = multiContainerForAll.models ?? [];
      const minContainer = multiContainerForAll.minCount ?? 1;
      const maxContainer = multiContainerForAll.maxCount ?? 99;
      // Прямые дочерние модели юнита с minCount > 0 — обязательные (например, Blightlord Champion)
      const directModelChildren = (unit.models ?? []).filter(m => m.entryType === 'model' && (m.minCount ?? 0) > 0);
      const mandatoryCount = directModelChildren.reduce((sum, m) => sum + m.minCount!, 0);
      const containerTotal = containerModels.reduce((sum, m) => sum + (modelCounts[m.id] ?? 0), 0);
      const totalCount = containerTotal + mandatoryCount;
      const cost = getCostForModelCount(unit.costBands, totalCount);
      // maxUnitSize = максимальный размер отряда (контейнер + обязательные)
      const maxUnitSize = maxContainer + mandatoryCount;
      const minUnitSize = minContainer + mandatoryCount;
      // Если выбрана модель «только при минимальном размере» (plague spewer+CCW) —
      // контейнер жёстко ограничен минимальным размером: не более minContainer моделей.
      const isMinSizeOnlySelected = containerModels.some(
        m => isMinSizeOnlyModel(m.maxInRoster, maxUnitSize) && (modelCounts[m.id] ?? 0) > 0
      );
      const effectiveMaxContainer = isMinSizeOnlySelected ? minContainer : maxContainer;
      const isValidTotal = containerTotal >= minContainer && containerTotal <= effectiveMaxContainer;
      const canAdd = isValidTotal && (remainingPoints === undefined || cost <= remainingPoints);
      const inRoster = countInRoster(unit.id);
      const limitReached = unit.maxInRoster !== undefined && inRoster >= unit.maxInRoster;
      // Ведущие модели (не зависят от числа других) — вверх списка
      const sortedContainerModels = [
        ...containerModels.filter(m => isPrimaryContainerModel(m.maxInRoster, maxUnitSize, minUnitSize)),
        ...containerModels.filter(m => !isPrimaryContainerModel(m.maxInRoster, maxUnitSize, minUnitSize)),
      ];
      return (
        <li key={unit.id} className="unit-item">
          <div className="unit-item-top">
            <div className="unit-info">
              <span className="unit-name">
                {unit.name}
                <span className="unit-type-badge">[U]</span>
              </span>
              <span className="unit-cost">{cost} pts</span>
            </div>
            <div className="unit-item-footer">
              {unit.maxInRoster !== undefined && (
                <span className={`unit-roster-count${limitReached ? ' unit-roster-count--limit' : ''}`}>
                  {inRoster}/{unit.maxInRoster}
                </span>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onAdd({
                  ...unit,
                  cost,
                  modelCounts: Object.fromEntries(containerModels.map(m => [m.id, modelCounts[m.id] ?? 0])),
                  modelCount: totalCount,
                })}
                disabled={!canAdd || limitReached}
                aria-label={attachMode ? 'Присоединить' : 'Добавить'}
              >
                +
              </button>
            </div>
          </div>
          {directModelChildren.length > 0 && (
            <ul className="unit-nested-models">
              {directModelChildren.map(m => (
                <li key={m.id} className="unit-nested-model-item">
                  <span className="unit-nested-model-name">
                    {m.name}
                    <span className="unit-type-badge">[M]</span>
                  </span>
                  <span className="unit-model-count-label">× {m.minCount} (обязательно)</span>
                </li>
              ))}
            </ul>
          )}
          <ul className="unit-nested-models">
            {sortedContainerModels.map(model => {
              const count = modelCounts[model.id] ?? 0;
              const otherTotal = containerTotal - count;
              const effectiveMax = calcEffectiveMax(model.maxInRoster, effectiveMaxContainer, otherTotal, totalCount, maxUnitSize, minUnitSize);
              const isPrimary = isPrimaryContainerModel(model.maxInRoster, maxUnitSize, minUnitSize);
              return (
                <li key={model.id} className={`unit-nested-model-item${isPrimary ? ' unit-nested-model-item--primary' : ''}`}>
                  <span className="unit-nested-model-name">
                    {model.name}
                    <span className="unit-type-badge">[M]</span>
                  </span>
                  <div className="unit-model-count">
                    <span className="unit-model-count-label">Миниатюр:</span>
                    <button
                      type="button"
                      className="unit-model-count-btn"
                      onClick={() => setModelCounts(prev => ({ ...prev, [model.id]: count - 1 }))}
                      disabled={count <= 0}
                      aria-label="Уменьшить количество миниатюр"
                    >−</button>
                    <input
                      type="number"
                      className="unit-model-count-input"
                      value={count}
                      min={0}
                      max={effectiveMax}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) {
                          setModelCounts(prev => ({ ...prev, [model.id]: Math.min(effectiveMax, Math.max(0, v)) }));
                        }
                      }}
                      aria-label="Количество миниатюр"
                    />
                    <button
                      type="button"
                      className="unit-model-count-btn"
                      onClick={() => setModelCounts(prev => ({ ...prev, [model.id]: count + 1 }))}
                      disabled={count >= effectiveMax}
                      aria-label="Увеличить количество миниатюр"
                    >+</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!isValidTotal && (
            <div className="unit-model-count-hint">
              Выберите от {minContainer} до {effectiveMaxContainer} миниатюр (выбрано: {containerTotal})
            </div>
          )}
        </li>
      );
    }

    // Случай 1 (Ironstrider): несколько типов моделей, стоимость — сумма индивидуальных
    const multiContainer = multiContainerForAll && !unit.costBands?.length
      ? multiContainerForAll
      : undefined;
    if (multiContainer) {
      const containerModels = multiContainer.models ?? [];
      const minTotal = multiContainer.minCount ?? 1;
      const maxTotal = multiContainer.maxCount ?? 99;
      const totalCount = containerModels.reduce((sum, m) => sum + (modelCounts[m.id] ?? 0), 0);
      const computedCost = containerModels.reduce((sum, m) => sum + (modelCounts[m.id] ?? 0) * (m.cost ?? 0), 0);
      const isValidTotal = totalCount >= minTotal && totalCount <= maxTotal;
      const canAdd = isValidTotal && (remainingPoints === undefined || computedCost <= remainingPoints);
      const inRoster = countInRoster(unit.id);
      const limitReached = unit.maxInRoster !== undefined && inRoster >= unit.maxInRoster;
      return (
        <li key={unit.id} className="unit-item">
          <div className="unit-item-top">
            <div className="unit-info">
              <span className="unit-name">
                {unit.name}
                <span className="unit-type-badge">[U]</span>
              </span>
              <span className="unit-cost">{computedCost} pts</span>
            </div>
            <div className="unit-item-footer">
              {unit.maxInRoster !== undefined && (
                <span className={`unit-roster-count${limitReached ? ' unit-roster-count--limit' : ''}`}>
                  {inRoster}/{unit.maxInRoster}
                </span>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onAdd({
                  ...unit,
                  cost: computedCost,
                  modelCounts: Object.fromEntries(containerModels.map(m => [m.id, modelCounts[m.id] ?? 0])),
                })}
                disabled={!canAdd || limitReached}
                aria-label={attachMode ? 'Присоединить' : 'Добавить'}
              >
                +
              </button>
            </div>
          </div>
          <ul className="unit-nested-models">
            {containerModels.map(model => {
              const count = modelCounts[model.id] ?? 0;
              const otherTotal = totalCount - count;
              const effectiveMax = calcEffectiveMax(model.maxInRoster, maxTotal, otherTotal);
              return (
                <li key={model.id} className="unit-nested-model-item">
                  <span className="unit-nested-model-name">
                    {model.name}
                    <span className="unit-type-badge">[M]</span>
                  </span>
                  {model.cost !== undefined && (
                    <span className="unit-cost">{model.cost} pts</span>
                  )}
                  <div className="unit-model-count">
                    <span className="unit-model-count-label">Миниатюр:</span>
                    <button
                      type="button"
                      className="unit-model-count-btn"
                      onClick={() => setModelCounts(prev => ({ ...prev, [model.id]: count - 1 }))}
                      disabled={count <= 0}
                      aria-label="Уменьшить количество миниатюр"
                    >−</button>
                    <input
                      type="number"
                      className="unit-model-count-input"
                      value={count}
                      min={0}
                      max={effectiveMax}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) {
                          setModelCounts(prev => ({ ...prev, [model.id]: Math.min(effectiveMax, Math.max(0, v)) }));
                        }
                      }}
                      aria-label="Количество миниатюр"
                    />
                    <button
                      type="button"
                      className="unit-model-count-btn"
                      onClick={() => setModelCounts(prev => ({ ...prev, [model.id]: count + 1 }))}
                      disabled={count >= effectiveMax}
                      aria-label="Увеличить количество миниатюр"
                    >+</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!isValidTotal && (
            <div className="unit-model-count-hint">
              Выберите от {minTotal} до {maxTotal} миниатюр (выбрано: {totalCount})
            </div>
          )}
        </li>
      );
    }

    // Контролы количества моделей — только для записей entryType="model" с диапазонами стоимости.
    // entryType="unit" (например, Poxwalkers) передаёт costBands дочерним [M] через api.ts buildChildTree.
    const hasBands = unit.entryType === 'model' && !!(unit.costBands && unit.costBands.length >= 1 &&
      (unit.costBands.length > 1 || (unit.costBands[0]?.minModels ?? 0) < (unit.costBands[0]?.maxModels ?? 0)));
    const minModels = hasBands ? unit.costBands![0].minModels : 1;
    const maxModels = hasBands ? unit.costBands![unit.costBands!.length - 1].maxModels : 1;
    const modelCount = hasBands ? (modelCounts[unit.id] ?? minModels) : unit.modelCount;

    // Для [U] с дочерними [M] с costBands: берём count из дочерней модели для расчёта стоимости
    const childModelForCount = !hasBands && unit.entryType === 'unit'
      ? findChildModelWithBands(unit.models)
      : undefined;
    const childModelBands = childModelForCount?.costBands;
    const childModelCount = childModelForCount && childModelBands
      ? (modelCounts[childModelForCount.id] ?? childModelBands[0].minModels)
      : undefined;

    const displayCost = hasBands && modelCount !== undefined
      ? getCostForModelCount(unit.costBands!, modelCount)
      : (childModelForCount && childModelBands && childModelCount !== undefined
        ? getCostForModelCount(childModelBands, childModelCount)
        : unit.cost);

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
                onClick={() => onAdd({ ...unit, cost: displayCost, modelCount: hasBands ? (modelCounts[unit.id] ?? minModels) : childModelCount })}
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
