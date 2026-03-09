import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useRosters } from '../contexts/RosterContext';
import { useAuth } from '../contexts/AuthContext';
import { AddUnitModal } from '../components/AddUnitModal';
import type { RosterUnit, Unit, UnitGroup, UnitCostBand } from '../types';
import * as api from '../services/api';
import { UNALIGNED_FORCES_ID } from '../services/api';

const POINTS_OPTIONS = [500, 1000, 1500, 2000, 2500];

function getCostForModelCount(bands: UnitCostBand[], count: number): number {
  const band = bands.find(b => count >= b.minModels && count <= b.maxModels);
  return band?.cost ?? bands[0].cost;
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

// Определяет, является ли модель «ведущей» — не зависит от числа других моделей через правило 1:N.
// Ведущие модели определяют максимальное количество зависимых (например, основные Blightlord Terminators).
// maxUnitSize — полный размер отряда (maxContainer + mandatoryCount), как в calcEffectiveMax.
function isPrimaryContainerModel(modelMaxInRoster: number | undefined, maxUnitSize: number): boolean {
  if (modelMaxInRoster === undefined) return true;
  const perN = maxUnitSize / modelMaxInRoster;
  return !(Number.isInteger(perN) && perN > 1);
}

// Вычисляет эффективный максимум для одного типа модели с учётом суммарного ограничения.
// Если maxUnitSize / modelMaxInRoster — целое число N > 1, применяется правило «1 на каждые N моделей»:
//   effectiveMax = floor(totalCount / N), ограниченное абсолютным лимитом и оставшимся местом в контейнере.
function calcEffectiveMax(
  modelMaxInRoster: number | undefined,
  maxTotal: number,
  otherTotal: number,
  totalCount?: number,
  maxUnitSize?: number,
): number {
  if (modelMaxInRoster !== undefined && totalCount !== undefined && maxUnitSize !== undefined) {
    const perN = maxUnitSize / modelMaxInRoster;
    if (Number.isInteger(perN) && perN > 1) {
      const allowedByRatio = Math.min(Math.floor(totalCount / perN), modelMaxInRoster);
      return Math.min(allowedByRatio, maxTotal - otherTotal);
    }
  }
  return Math.min(modelMaxInRoster ?? maxTotal, maxTotal - otherTotal);
}

function renderRosterModels(
  models: Unit[],
  parentCostBands?: UnitCostBand[],
  parentModelCount?: number,
  onParentCountChange?: (val: number) => void
): React.ReactNode {
  return models.map((model) => {
    if (model.entryType === undefined && model.models && model.models.length > 0) {
      return (
        <li key={model.id} className="unit-container-group">
          <details className="unit-container-details">
            <summary className="unit-container-label">— {model.name}</summary>
            <ul className="unit-nested-models unit-nested-models--roster">
              {renderRosterModels(model.models, parentCostBands, parentModelCount, onParentCountChange)}
            </ul>
          </details>
        </li>
      );
    }
    // Для [M]: собственные costBands (если есть) или унаследованные от родительского [U]
    const effectiveBands = model.entryType === 'model'
      ? (model.costBands?.length ? model.costBands : parentCostBands)
      : undefined;
    const hasBands = !!(effectiveBands && (
      effectiveBands.length > 1 ||
      (effectiveBands[0]?.minModels ?? 0) < (effectiveBands[0]?.maxModels ?? 0)
    ));
    const minM = hasBands ? (effectiveBands?.[0].minModels ?? 0) : 0;
    const maxM = hasBands ? (effectiveBands?.[effectiveBands.length - 1].maxModels ?? 0) : 0;
    // Текущий count берётся из primaryUnit.modelCount (хранится на уровне [U])
    const currentCount = hasBands ? (parentModelCount ?? minM) : undefined;
    return (
      <li key={model.id} className="unit-nested-model-item">
        <span className="unit-nested-model-name">
          {model.name}
          {model.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
        </span>
        {model.cost !== undefined && (
          <span className="unit-cost">{model.cost} pts</span>
        )}
        {hasBands && currentCount !== undefined && onParentCountChange && (
          <div className="unit-model-count">
            <span className="unit-model-count-label">Моделей:</span>
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => onParentCountChange(currentCount - 1)}
              disabled={currentCount <= minM}
              aria-label="Уменьшить количество моделей"
            >−</button>
            <input
              type="number"
              className="unit-model-count-input"
              value={currentCount}
              min={minM}
              max={maxM}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onParentCountChange(val);
              }}
              aria-label="Количество моделей"
            />
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => onParentCountChange(currentCount + 1)}
              disabled={currentCount >= maxM}
              aria-label="Увеличить количество моделей"
            >+</button>
          </div>
        )}
      </li>
    );
  });
}

function loadLocalUnits(rosterId: string): UnitGroup[] {
  try {
    const data = localStorage.getItem(`roster_units_${rosterId}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalUnits(rosterId: string, units: UnitGroup[]) {
  localStorage.setItem(`roster_units_${rosterId}`, JSON.stringify(units));
}

export function RosterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rosters, editRoster, removeRoster } = useRosters();
  const { token } = useAuth();
  const roster = rosters.find(r => r.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(roster?.name || '');
  const [pointsLimit, setPointsLimit] = useState(roster?.pointsLimit || 2000);
  const [allowLegends, setAllowLegends] = useState(roster?.allowLegends ?? false);
  const [saving, setSaving] = useState(false);
  const [unitAddTarget, setUnitAddTarget] = useState<{ groupId: string | null }>({ groupId: null });
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);

  const totalCost = unitGroups.reduce((sum, group) =>
    sum + group.units.reduce((s, u) => s + (u.cost ?? 0), 0), 0
  );
  const remainingPoints = roster ? roster.pointsLimit - totalCost : 0;

  const hasLegendsUnits = (roster?.factionId === UNALIGNED_FORCES_ID && unitGroups.some(g => g.units.length > 0)) ||
    unitGroups.some(group =>
      group.units.some(u => u.name.toLowerCase().includes('[legends]'))
    );

  useEffect(() => {
    if (!id) return;
    if (token) {
      api.getRosterUnits(token, id).then(setUnitGroups).catch(err => {
        console.error('Failed to load roster units:', err);
        setUnitGroups([]);
      });
    } else {
      setUnitGroups(loadLocalUnits(id));
    }
  }, [id, token]);

  const persistUnits = useCallback((groups: UnitGroup[]) => {
    if (!id) return;
    if (token) {
      api.updateRosterUnits(token, id, groups).catch(console.error);
    } else {
      saveLocalUnits(id, groups);
    }
  }, [id, token]);

  if (!roster) {
    return (
      <div className="container">
        <div className="empty-state">
          <p>Ростер не найден</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">На главную</button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await editRoster(roster.id, { name, pointsLimit, allowLegends });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить ростер "${roster.name}"?`)) return;
    await removeRoster(roster.id);
    navigate('/');
  };

  return (
    <div className="container">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="btn btn-back">← Назад</button>
        <div className="page-header-actions">
          <button
            onClick={() => { setEditing(!editing); setName(roster.name); setPointsLimit(roster.pointsLimit); setAllowLegends(roster.allowLegends ?? false); }}
            className="btn btn-secondary btn-sm"
          >
            {editing ? 'Отмена' : 'Редактировать'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger btn-sm">Удалить</button>
        </div>
      </header>

      {editing ? (
        <div className="edit-form">
          <div className="form-group">
            <label>Название</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="form-input" />
          </div>
          <div className="form-group">
            <label>Лимит очков</label>
            <div className="points-selector">
              {POINTS_OPTIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`points-option ${pointsLimit === p ? 'active' : ''}`}
                  onClick={() => setPointsLimit(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className={`toggle-row${hasLegendsUnits ? ' toggle-row--disabled' : ''}`}>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={allowLegends}
                  disabled={hasLegendsUnits}
                  onChange={e => setAllowLegends(e.target.checked)}
                />
                <span className="toggle-track" />
              </span>
              <span className="toggle-label">
                [LEG] Разрешить отряды с [Legends]
              </span>
            </label>
            {hasLegendsUnits && (
              <div className="form-hint">Нельзя отключить: в ростере есть отряды с [Legends]</div>
            )}
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      ) : (
        <div className="roster-detail">
          <h1>{roster.name}</h1>
          <div className="roster-meta">
            <div className="meta-item">
              <span className="meta-label">Фракция</span>
              <span className="meta-value">⚔️ {roster.factionName}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Лимит очков</span>
              <span className="meta-value points-badge">{roster.pointsLimit} очков</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Использовано очков</span>
              <span className={`meta-value points-badge ${totalCost > roster.pointsLimit ? 'points-over-limit' : ''}`}>
                {totalCost} / {roster.pointsLimit}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Создан</span>
              <span className="meta-value">{new Date(roster.createdAt).toLocaleDateString('ru-RU')}</span>
            </div>
          </div>
          <div className="units-section">
            <div className="section-header">
              <h2>Отряды</h2>
              <button className="btn btn-primary btn-sm" onClick={() => { setUnitAddTarget({ groupId: null }); setAddingUnit(true); }}>+ Добавить отряд</button>
            </div>
            {unitGroups.length === 0 ? (
              <div className="empty-state">
                <p>Отряды ещё не добавлены</p>
              </div>
            ) : (
              <div className="unit-groups">
                {unitGroups.map((group) => {
                  if (group.units.length === 0) return null;
                  const primaryUnit = group.units[0];
                  return (
                  <div key={group.id} className="unit-group">
                    <div className="unit-group-header">
                      <div className="unit-group-info">
                        <span className="unit-group-primary-name">
                          {primaryUnit.name}
                          {primaryUnit.entryType === 'unit' && <span className="unit-type-badge">[U]</span>}
                          {primaryUnit.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
                        </span>
                        <div className="unit-group-meta">
                          <span className="roster-unit-type">{primaryUnit.category}</span>
                          {primaryUnit.cost !== undefined && (
                            <span className="unit-cost">{primaryUnit.cost} pts</span>
                          )}
                        </div>
                        {primaryUnit.entryType === 'model' && primaryUnit.costBands &&
                          (primaryUnit.costBands.length > 1 || (primaryUnit.costBands[0]?.minModels ?? 0) < (primaryUnit.costBands[0]?.maxModels ?? 0)) && (() => {
                          const bands = primaryUnit.costBands!;
                          const minM = bands[0].minModels;
                          const maxM = bands[bands.length - 1].maxModels;
                          const currentCount = primaryUnit.modelCount ?? minM;
                          const setCount = (val: number) => {
                            const clamped = Math.min(maxM, Math.max(minM, val));
                            const newCost = getCostForModelCount(bands, clamped);
                            const updated = unitGroups.map(g => g.id === group.id
                              ? {
                                  ...g,
                                  units: g.units.map((u, idx) => idx === 0
                                    ? { ...u, modelCount: clamped, cost: newCost }
                                    : u
                                  )
                                }
                              : g
                            );
                            setUnitGroups(updated);
                            persistUnits(updated);
                          };
                          return (
                            <div className="unit-model-count">
                              <span className="unit-model-count-label">Моделей:</span>
                              <button
                                type="button"
                                className="unit-model-count-btn"
                                onClick={() => setCount(currentCount - 1)}
                                disabled={currentCount <= minM}
                                aria-label="Уменьшить количество моделей"
                              >−</button>
                              <input
                                type="number"
                                className="unit-model-count-input"
                                value={currentCount}
                                min={minM}
                                max={maxM}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val)) setCount(val);
                                }}
                                aria-label="Количество моделей"
                              />
                              <button
                                type="button"
                                className="unit-model-count-btn"
                                onClick={() => setCount(currentCount + 1)}
                                disabled={currentCount >= maxM}
                                aria-label="Увеличить количество моделей"
                              >+</button>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="unit-group-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          aria-label="Присоединить"
                          onClick={() => { setUnitAddTarget({ groupId: group.id }); setAddingUnit(true); }}
                        >
                          +
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          aria-label="Дублировать"
                          disabled={(() => {
                            // Проверка лимита очков
                            const groupCost = group.units.reduce((s, u) => s + (u.cost ?? 0), 0);
                            if (roster && totalCost + groupCost > roster.pointsLimit) return true;
                            // Проверка ограничения maxInRoster при дублировании
                            const primary = group.units[0];
                            if (primary?.maxInRoster !== undefined) {
                              const currentCount = unitGroups.filter(g => g.units.length > 0 && g.units[0].id === primary.id).length;
                              if (currentCount >= primary.maxInRoster) return true;
                            }
                            return false;
                          })()}
                          onClick={() => {
                            const duplicated = {
                              ...group,
                              id: crypto.randomUUID(),
                              units: group.units.map(u => ({ ...u, entryId: crypto.randomUUID() }))
                            };
                            const updated = [...unitGroups, duplicated];
                            setUnitGroups(updated);
                            persistUnits(updated);
                          }}
                        >
                          ⎘
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            const updated = unitGroups.filter(g => g.id !== group.id);
                            setUnitGroups(updated);
                            persistUnits(updated);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {group.units.slice(1).length > 0 && (
                      <ul className="unit-group-attached">
                        {group.units.slice(1).map((unit) => {
                          // Контролы только для присоединённых [M] с диапазонами стоимости
                          const hasBands = unit.entryType === 'model' && !!(unit.costBands && unit.costBands.length >= 1 &&
                            (unit.costBands.length > 1 || (unit.costBands[0]?.minModels ?? 0) < (unit.costBands[0]?.maxModels ?? 0)));
                          const bands = hasBands ? unit.costBands! : null;
                          const minM = bands ? bands[0].minModels : 1;
                          const maxM = bands ? bands[bands.length - 1].maxModels : 1;
                          const currentCount = unit.modelCount ?? minM;
                          const setAttachedCount = (val: number) => {
                            const clamped = Math.min(maxM, Math.max(minM, val));
                            const newCost = bands ? getCostForModelCount(bands, clamped) : unit.cost;
                            const updated = unitGroups.map(g => g.id === group.id
                              ? {
                                  ...g,
                                  units: g.units.map(u => u.entryId === unit.entryId
                                    ? { ...u, modelCount: clamped, cost: newCost }
                                    : u
                                  )
                                }
                              : g
                            );
                            setUnitGroups(updated);
                            persistUnits(updated);
                          };
                          return (
                          <li key={unit.entryId} className="unit-group-attached-item">
                            <div className="unit-group-attached-info">
                              <span className="unit-group-attached-name">{unit.name}</span>
                              <div className="unit-group-meta">
                                <span className="roster-unit-type">{unit.category}</span>
                                {unit.cost !== undefined && (
                                  <span className="unit-cost">{unit.cost} pts</span>
                                )}
                              </div>
                            </div>
                            {hasBands && bands && (
                              <div className="unit-model-count">
                                <span className="unit-model-count-label">Моделей:</span>
                                <button
                                  type="button"
                                  className="unit-model-count-btn"
                                  onClick={() => setAttachedCount(currentCount - 1)}
                                  disabled={currentCount <= minM}
                                  aria-label="Уменьшить количество моделей"
                                >−</button>
                                <input
                                  type="number"
                                  className="unit-model-count-input"
                                  value={currentCount}
                                  min={minM}
                                  max={maxM}
                                  onChange={e => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val)) setAttachedCount(val);
                                  }}
                                  aria-label="Количество моделей"
                                />
                                <button
                                  type="button"
                                  className="unit-model-count-btn"
                                  onClick={() => setAttachedCount(currentCount + 1)}
                                  disabled={currentCount >= maxM}
                                  aria-label="Увеличить количество моделей"
                                >+</button>
                              </div>
                            )}
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                const updated = unitGroups.map(g => g.id === group.id
                                  ? { ...g, units: g.units.filter(u => u.entryId !== unit.entryId) }
                                  : g
                                );
                                setUnitGroups(updated);
                                persistUnits(updated);
                              }}
                            >
                              ✕
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    )}
                    {primaryUnit.entryType === 'unit' && primaryUnit.models && primaryUnit.models.length > 0 && (() => {
                      const multiContainerForAll = findMultiModelContainer(primaryUnit.models);

                      // Случай 3: Blightlord-подобный — несколько типов моделей + costBands на [U]
                      // Стоимость определяется по суммарному числу моделей через costBands
                      // Отличие от Poxwalkers (Case 2): в контейнере несколько разных типов моделей
                      if (multiContainerForAll && primaryUnit.costBands?.length && (multiContainerForAll.models?.length ?? 0) > 1) {
                        const containerModels = multiContainerForAll.models ?? [];
                        const minContainer = multiContainerForAll.minCount ?? 1;
                        const maxContainer = multiContainerForAll.maxCount ?? 99;
                        const bands = primaryUnit.costBands!;
                        // Прямые дочерние модели юнита с minCount > 0 — обязательные (например, Blightlord Champion)
                        const directModelChildren = (primaryUnit.models ?? []).filter(m => m.entryType === 'model' && (m.minCount ?? 0) > 0);
                        const mandatoryCount = directModelChildren.reduce((sum, m) => sum + m.minCount!, 0);
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        const containerTotal = containerModels.reduce((sum, m) => sum + (currentCounts[m.id] ?? 0), 0);
                        // Ведущие модели (не зависят от числа других) — вверх списка
                        const sortedContainerModels = [
                          ...containerModels.filter(m => isPrimaryContainerModel(m.maxInRoster, maxContainer + mandatoryCount)),
                          ...containerModels.filter(m => !isPrimaryContainerModel(m.maxInRoster, maxContainer + mandatoryCount)),
                        ];

                        const handleModelCountChange = (modelId: string, val: number) => {
                          const model = containerModels.find(m => m.id === modelId);
                          if (!model) return;
                          const otherTotal = containerTotal - (currentCounts[modelId] ?? 0);
                          const effectiveMax = calcEffectiveMax(model.maxInRoster, maxContainer, otherTotal, containerTotal + mandatoryCount, maxContainer + mandatoryCount);
                          const clamped = Math.min(effectiveMax, Math.max(0, val));
                          const newCounts = { ...currentCounts, [modelId]: clamped };
                          const newContainerTotal = Object.values(newCounts).reduce((s, v) => s + v, 0);
                          const newTotal = newContainerTotal + mandatoryCount;
                          const newCost = getCostForModelCount(bands, newTotal);
                          const updated = unitGroups.map(g => g.id === group.id
                            ? {
                                ...g,
                                units: g.units.map((u, idx) => idx === 0
                                  ? { ...u, modelCounts: newCounts, modelCount: newTotal, cost: newCost }
                                  : u
                                )
                              }
                            : g
                          );
                          setUnitGroups(updated);
                          persistUnits(updated);
                        };

                        return (
                          <>
                            {directModelChildren.length > 0 && (
                              <ul className="unit-nested-models unit-nested-models--roster">
                                {directModelChildren.map(m => (
                                  <li key={m.id} className="unit-nested-model-item">
                                    <span className="unit-nested-model-name">
                                      {m.name}
                                      <span className="unit-type-badge">[M]</span>
                                    </span>
                                    <span className="unit-model-count-label">× {m.minCount}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <ul className="unit-nested-models unit-nested-models--roster">
                              {sortedContainerModels.map(model => {
                                const count = currentCounts[model.id] ?? 0;
                                const otherTotal = containerTotal - count;
                                const effectiveMax = calcEffectiveMax(model.maxInRoster, maxContainer, otherTotal, containerTotal + mandatoryCount, maxContainer + mandatoryCount);
                                const isPrimary = isPrimaryContainerModel(model.maxInRoster, maxContainer + mandatoryCount);
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
                                        onClick={() => handleModelCountChange(model.id, count - 1)}
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
                                          if (!isNaN(v)) handleModelCountChange(model.id, v);
                                        }}
                                        aria-label="Количество миниатюр"
                                      />
                                      <button
                                        type="button"
                                        className="unit-model-count-btn"
                                        onClick={() => handleModelCountChange(model.id, count + 1)}
                                        disabled={count >= effectiveMax}
                                        aria-label="Увеличить количество миниатюр"
                                      >+</button>
                                    </div>
                                  </li>
                                );
                              })}
                              {(containerTotal < minContainer || containerTotal > maxContainer) && (
                                <li className="unit-model-count-hint">
                                  Итого: {containerTotal} / {maxContainer} (мин. {minContainer})
                                </li>
                              )}
                            </ul>
                          </>
                        );
                      }

                      // Случай 1: отряд с несколькими типами моделей (Ironstrider-подобная структура)
                      // Если у [U] есть собственные costBands (Poxwalkers-подобный), пропускаем этот случай
                      const multiContainer = !primaryUnit.costBands?.length
                        ? multiContainerForAll
                        : undefined;
                      if (multiContainer) {
                        const containerModels = multiContainer.models ?? [];
                        const minTotal = multiContainer.minCount ?? 1;
                        const maxTotal = multiContainer.maxCount ?? 99;
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        const totalCount = containerModels.reduce((sum, m) => sum + (currentCounts[m.id] ?? 0), 0);

                        const handleModelCountChange = (modelId: string, val: number) => {
                          const model = containerModels.find(m => m.id === modelId);
                          if (!model) return;
                          const otherTotal = totalCount - (currentCounts[modelId] ?? 0);
                          const effectiveMax = calcEffectiveMax(model.maxInRoster, maxTotal, otherTotal);
                          const clamped = Math.min(effectiveMax, Math.max(0, val));
                          const newCounts = { ...currentCounts, [modelId]: clamped };
                          const newCost = containerModels.reduce((sum, m) => sum + (newCounts[m.id] ?? 0) * (m.cost ?? 0), 0);
                          const updated = unitGroups.map(g => g.id === group.id
                            ? {
                                ...g,
                                units: g.units.map((u, idx) => idx === 0
                                  ? { ...u, modelCounts: newCounts, cost: newCost }
                                  : u
                                )
                              }
                            : g
                          );
                          setUnitGroups(updated);
                          persistUnits(updated);
                        };

                        return (
                          <ul className="unit-nested-models unit-nested-models--roster">
                            {containerModels.map(model => {
                              const count = currentCounts[model.id] ?? 0;
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
                                      onClick={() => handleModelCountChange(model.id, count - 1)}
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
                                        if (!isNaN(v)) handleModelCountChange(model.id, v);
                                      }}
                                      aria-label="Количество миниатюр"
                                    />
                                    <button
                                      type="button"
                                      className="unit-model-count-btn"
                                      onClick={() => handleModelCountChange(model.id, count + 1)}
                                      disabled={count >= effectiveMax}
                                      aria-label="Увеличить количество миниатюр"
                                    >+</button>
                                  </div>
                                </li>
                              );
                            })}
                            {(totalCount < minTotal || totalCount > maxTotal) && (
                              <li className="unit-model-count-hint">
                                Итого: {totalCount} / {maxTotal} (мин. {minTotal})
                              </li>
                            )}
                          </ul>
                        );
                      }

                      // Случай 2: обычный отряд с единым счётчиком (Poxwalkers и подобные)
                      // Передаём costBands и callback в renderRosterModels,
                      // чтобы дочерние [M] могли показать контролы и обновить modelCount у [U]
                      const bands = primaryUnit.costBands;
                      const minM = bands?.[0].minModels ?? 0;
                      const maxM = bands ? bands[bands.length - 1].maxModels : 0;
                      const currentCount = primaryUnit.modelCount ?? minM;
                      const handleCountChange = bands ? (val: number) => {
                        const clamped = Math.min(maxM, Math.max(minM, val));
                        const newCost = getCostForModelCount(bands, clamped);
                        const updated = unitGroups.map(g => g.id === group.id
                          ? {
                              ...g,
                              units: g.units.map((u, idx) => idx === 0
                                ? { ...u, modelCount: clamped, cost: newCost }
                                : u
                              )
                            }
                          : g
                        );
                        setUnitGroups(updated);
                        persistUnits(updated);
                      } : undefined;
                      return (
                        <ul className="unit-nested-models unit-nested-models--roster">
                          {renderRosterModels(primaryUnit.models, bands, currentCount, handleCountChange)}
                        </ul>
                      );
                    })()}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          {addingUnit && (
            <AddUnitModal
              factionId={roster.factionId}
              factionName={roster.factionName}
              attachMode={unitAddTarget.groupId !== null}
              onClose={() => setAddingUnit(false)}
              remainingPoints={remainingPoints}
              currentUnitGroups={unitGroups}
              allowLegends={roster.allowLegends ?? false}
              onAdd={unit => {
                const rosterUnit: RosterUnit = { ...unit, entryId: crypto.randomUUID() };
                let updated: UnitGroup[];
                if (unitAddTarget.groupId === null) {
                  updated = [...unitGroups, { id: crypto.randomUUID(), units: [rosterUnit] }];
                } else {
                  updated = unitGroups.map(g => g.id === unitAddTarget.groupId
                    ? { ...g, units: [...g.units, rosterUnit] }
                    : g
                  );
                }
                setUnitGroups(updated);
                persistUnits(updated);
                setAddingUnit(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
