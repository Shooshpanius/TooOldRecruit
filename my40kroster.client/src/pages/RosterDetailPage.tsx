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
  // undefined maxModels означает «не ограничено сверху» (открытый диапазон)
  const band = bands.find(b => count >= b.minModels && count <= (b.maxModels ?? Infinity));
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

// Возвращает ВСЕ ограниченные контейнеры (min/max) из прямых дочерних узлов юнита.
// Используется для Case 4 — юниты с несколькими независимыми контейнерами (Inquisitorial Agents).
function findAllMultiModelContainers(models?: Unit[]): Unit[] {
  if (!models) return [];
  return models.filter(
    m => m.entryType === undefined && m.models && m.models.length > 0 &&
      (m.minCount !== undefined || m.maxCount !== undefined)
  );
}

// Наибольший общий делитель (алгоритм Евклида)
function gcd(a: number, b: number): number {
  while (b !== 0) { const temp = b; b = a % b; a = temp; }
  return a;
}

// Возвращает максимум контейнера для Case 4.
// Контейнеры в Case 4 независимы друг от друга — используем только собственный maxCount.
function calcCase4ContainerMax(container: Unit): number {
  return container.maxCount ?? 99;
}

// Вычисляет эффективный максимум модели внутри контейнера (Case 4).
// Лимит — наименьшее из собственного maxInRoster и оставшейся ёмкости контейнера.
// Math.max(0, ...) гарантирует неотрицательный результат при переполнении контейнера.
function calcCase4ModelMax(modelMaxInRoster: number | undefined, effectiveCMax: number, cTotal: number, count: number): number {
  const maxPerModel = modelMaxInRoster ?? effectiveCMax;
  const otherInContainer = cTotal - count;
  return Math.max(0, Math.min(maxPerModel, effectiveCMax - otherInContainer));
}

// Определяет, является ли модель «ведущей» — не зависит от числа других моделей через правило 1:N.
// Ведущие модели отображаются вверху списка.
// Если maxInRoster >= maxUnitSize — модель может занять все слоты, считается ведущей.
// Модели с НОД=1 (soulreaper cannon, combi-bolter) — ведущие (абсолютный лимит, не зависит от состава).
// Модели с НОД>1 и maxInRoster < maxUnitSize (flail "1 на 5", combi-weapon "3 на 5") — зависимые (secondary).
function isPrimaryContainerModel(modelMaxInRoster: number | undefined, maxUnitSize: number): boolean {
  if (modelMaxInRoster === undefined) return true;
  // Если maxInRoster >= maxUnitSize — модель может заполнить весь контейнер, ограничений нет
  if (modelMaxInRoster >= maxUnitSize) return true;
  // Зависимые только когда НОД > 1 (есть групповое ограничение)
  return gcd(modelMaxInRoster, maxUnitSize) === 1;
}

// Вычисляет эффективный максимум для одного типа модели с учётом суммарного ограничения.
// Два случая на основе НОД(maxInRoster, maxUnitSize):
//   НОД > 1 И maxInRoster < maxUnitSize: правило «perCount на каждые perModels» (flail "1 на 5", combi-weapon "3 на 5")
//            effectiveMax = floor(totalCount / perModels) * perCount
//   Иначе (в том числе maxInRoster=1): обычный абсолютный лимит (soulreaper cannon, combi-bolter и т.д.)
//            effectiveMax = min(maxInRoster, свободных мест)
// Важно: если maxInRoster >= maxUnitSize (например Kataphron Breachers — все 4 типа моделей имеют
// maxInRoster = 6 = maxUnitSize), per-N формула НЕ применяется — модель может занять все слоты контейнера.
function calcEffectiveMax(
  modelMaxInRoster: number | undefined,
  maxTotal: number,
  otherTotal: number,
  totalCount?: number,
  maxUnitSize?: number,
): number {
  if (modelMaxInRoster !== undefined && totalCount !== undefined && maxUnitSize !== undefined) {
    const g = gcd(modelMaxInRoster, maxUnitSize);
    // per-N формула применяется только когда модель строго меньше максимального размера отряда
    if (g > 1 && modelMaxInRoster < maxUnitSize) {
      // Правило «perCount на каждые perModels моделей» (1-per-5, 3-per-5 и т.д.)
      const perModels = maxUnitSize / g;
      const perCount = modelMaxInRoster / g;
      const allowedByRatio = Math.min(Math.floor(totalCount / perModels) * perCount, modelMaxInRoster);
      return Math.min(allowedByRatio, maxTotal - otherTotal);
    }
  }
  return Math.min(modelMaxInRoster ?? maxTotal, maxTotal - otherTotal);
}

// Рекурсивно считает сумму счётчиков всех [M]-узлов в дереве (включая вложенные контейнеры).
// Для моделей без явной записи в counts берём minCount ?? 0 (согласованно с ownCount в контролах).
function countAllModels(models: Unit[], counts: Record<string, number>): number {
  return models.reduce((sum, m) => {
    if (m.entryType === 'model') return sum + (counts[m.id] ?? m.minCount ?? 0);
    if (m.models) return sum + countAllModels(m.models, counts);
    return sum;
  }, 0);
}

// Интерактивный рендер состава отряда с фиксированной стоимостью.
// Отображает иерархию моделей с кнопками +/− для выбора опциональных миниатюр.
//   - Фиксированные модели (minCount === maxInRoster > 0) → метка «×N (обязательно)», без контролов
//   - Опциональные/переменные модели → кнопки +/−, максимум ограничен лимитом контейнера
//   - Контейнеры («9 Exaction Vigilants», «Up to 2:») → заголовок с счётчиком N/max
function renderFixedCompositionControls(
  models: Unit[],
  counts: Record<string, number>,
  onCountChange: (modelId: string, newVal: number) => void,
  parentMaxCount?: number,
): React.ReactNode {
  const containerTotal = countAllModels(models, counts);
  return models.map(model => {
    if (model.entryType === undefined && model.models && model.models.length > 0) {
      const subContainerTotal = countAllModels(model.models, counts);
      // Показываем диапазон «min–max» если min ≠ max, иначе просто max
      const rangeStr = model.maxCount !== undefined
        ? (model.minCount !== undefined && model.minCount !== model.maxCount
            ? `${model.minCount}–${model.maxCount}`
            : String(model.maxCount))
        : undefined;
      const isBelowMin = model.minCount !== undefined && subContainerTotal < model.minCount;
      return (
        <li key={model.id} className="unit-nested-model-item unit-nested-model-item--group">
          <span className="unit-nested-model-name">{model.name}</span>
          {rangeStr !== undefined && (
            <span className={`unit-model-count-label${isBelowMin ? ' unit-model-count-label--error' : ''}`}>
              {subContainerTotal}/{rangeStr}
            </span>
          )}
          <ul className="unit-nested-models">
            {renderFixedCompositionControls(model.models, counts, onCountChange, model.maxCount)}
            {isBelowMin && (
              <li className="unit-model-count-hint unit-model-count-hint--error">
                Необходимо не менее {model.minCount} (выбрано: {subContainerTotal})
              </li>
            )}
          </ul>
        </li>
      );
    }
    // Фиксированная модель (minCount === maxInRoster > 0) — без контролов
    const isFixed = model.minCount !== undefined && model.minCount > 0
      && model.minCount === model.maxInRoster;
    if (isFixed) {
      return (
        <li key={model.id} className="unit-nested-model-item">
          <span className="unit-nested-model-name">
            {model.name}
            {model.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
          </span>
          {model.minCount === 1 ? (
            <label className="unit-model-checkbox unit-model-checkbox--mandatory">
              <input type="checkbox" checked readOnly aria-label={`${model.name} (обязательно)`} />
            </label>
          ) : (
            <span className="unit-model-count-label">×{model.minCount} (обязательно)</span>
          )}
        </li>
      );
    }
    const minCount = model.minCount ?? 0;
    // Если у модели нет явного maxInRoster, используем ёмкость родительского контейнера
    const maxPerModel = model.maxInRoster !== undefined ? model.maxInRoster : (parentMaxCount ?? 99);
    const ownCount = counts[model.id] ?? minCount;
    const otherInContainer = containerTotal - ownCount;
    let effectiveMax = parentMaxCount !== undefined
      ? Math.min(maxPerModel, parentMaxCount - otherInContainer)
      : maxPerModel;
    // Взаимоисключающая группа: если другая модель из той же группы уже выбрана (count > 0) — блокируем
    if (model.exclusiveGroup) {
      const groupConflict = models.some(
        sibling => sibling.id !== model.id
          && sibling.exclusiveGroup === model.exclusiveGroup
          && (counts[sibling.id] ?? sibling.minCount ?? 0) > 0
      );
      if (groupConflict) effectiveMax = 0;
    }
    const effectiveCap = Math.max(effectiveMax, minCount);
    const setCount = (val: number) => {
      onCountChange(model.id, Math.max(minCount, Math.min(val, effectiveCap)));
    };
    // Бинарный выбор (0 или 1): показываем чекбокс вместо +/−
    const isBinary = minCount === 0 && maxPerModel === 1;
    return (
      <li key={model.id} className="unit-nested-model-item">
        <span className="unit-nested-model-name">
          {model.name}
          {model.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
        </span>
        {isBinary ? (
          <label className="unit-model-checkbox unit-model-checkbox--optional">
            <input
              type="checkbox"
              checked={ownCount > 0}
              disabled={effectiveMax === 0}
              onChange={e => setCount(e.target.checked ? 1 : 0)}
              aria-label={`Добавить ${model.name}`}
            />
          </label>
        ) : (
          <div className="unit-model-count">
            <span className="unit-model-count-label">Миниатюр:</span>
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => setCount(ownCount - 1)}
              disabled={ownCount <= minCount}
              aria-label="Уменьшить количество миниатюр"
            >−</button>
            <input
              type="number"
              className="unit-model-count-input"
              value={ownCount}
              min={minCount}
              max={effectiveCap}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setCount(v);
              }}
              aria-label="Количество миниатюр"
            />
            <button
              type="button"
              className="unit-model-count-btn"
              onClick={() => setCount(ownCount + 1)}
              disabled={ownCount >= effectiveCap}
              aria-label="Увеличить количество миниатюр"
            >+</button>
          </div>
        )}
      </li>
    );
  });
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
      (effectiveBands[0]?.minModels ?? 0) < (effectiveBands[0]?.maxModels ?? Infinity)
    ));
    const minM = hasBands ? (effectiveBands?.[0].minModels ?? 0) : 0;
    // undefined maxModels в последнем диапазоне означает «не ограничено сверху»;
    // используем maxInRoster модели как фактический верхний предел для UI-контрола
    const maxM = hasBands ? (effectiveBands?.[effectiveBands.length - 1].maxModels ?? model.maxInRoster ?? 99) : 0;
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
  const [detachmentName, setDetachmentName] = useState(roster?.detachmentName || '');
  const [detachments, setDetachments] = useState<string[]>([]);
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

  // Загружаем список детачментов для фракции при открытии режима редактирования
  useEffect(() => {
    if (!editing || !roster?.factionId) return;
    api.getDetachments(roster.factionId).then(setDetachments).catch(() => setDetachments([]));
  }, [editing, roster?.factionId]);

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
      await editRoster(roster.id, { name, pointsLimit, allowLegends, detachmentName: detachmentName.trim() || undefined });
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
            onClick={() => { setEditing(!editing); setName(roster.name); setPointsLimit(roster.pointsLimit); setAllowLegends(roster.allowLegends ?? false); setDetachmentName(roster.detachmentName || ''); }}
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
          {detachments.length > 0 && (
            <div className="form-group">
              <label>Детачмент</label>
              <select
                value={detachmentName}
                onChange={e => setDetachmentName(e.target.value)}
                className="form-input"
              >
                <option value="">— не выбран —</option>
                {detachments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
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
            {roster.detachmentName && (
              <div className="meta-item">
                <span className="meta-label">Детачмент</span>
                <span className="meta-value">🛡️ {roster.detachmentName}</span>
              </div>
            )}
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
                          (primaryUnit.costBands.length > 1 || (primaryUnit.costBands[0]?.minModels ?? 0) < (primaryUnit.costBands[0]?.maxModels ?? Infinity)) && (() => {
                          const bands = primaryUnit.costBands!;
                          const minM = bands[0].minModels;
                          // undefined maxModels в последнем диапазоне означает «не ограничено сверху»
                          const maxM = bands[bands.length - 1].maxModels ?? primaryUnit.maxInRoster ?? 99;
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
                            (unit.costBands.length > 1 || (unit.costBands[0]?.minModels ?? 0) < (unit.costBands[0]?.maxModels ?? Infinity)));
                          const bands = hasBands ? unit.costBands! : null;
                          const minM = bands ? bands[0].minModels : 1;
                          // undefined maxModels в последнем диапазоне означает «не ограничено сверху»
                          const maxM = bands ? (bands[bands.length - 1].maxModels ?? unit.maxInRoster ?? 99) : 1;
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

                      // Случай 4: юнит с несколькими независимыми контейнерами и переменной стоимостью по costBands.
                      // Пример: Inquisitorial Agents — «1-2 Gun Servitors» + «5-10 Acolytes».
                      const allBoundedContainers = primaryUnit.costBands?.length
                        ? findAllMultiModelContainers(primaryUnit.models)
                        : [];

                      if (allBoundedContainers.length >= 2) {
                        const bands = primaryUnit.costBands!;
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        const totalCount = allBoundedContainers.reduce(
                          (sum, c) => sum + (c.models ?? []).reduce((cs, m) => cs + (currentCounts[m.id] ?? (m.minCount ?? 0)), 0),
                          0
                        );
                        // Стоимость определяется по суммарному числу моделей во ВСЕХ контейнерах
                        // (costBands в BSData всегда калиброваны по общему числу миниатюр отряда).

                        const handleModelCountChange = (containerId: string, modelId: string, val: number) => {
                          const container = allBoundedContainers.find(c => c.id === containerId);
                          if (!container) return;
                          const cModels = container.models ?? [];
                          // Эффективный максимум контейнера (независимый для каждого контейнера в Case 4)
                          const effectiveCMax = calcCase4ContainerMax(container);
                          const cTotal = cModels.reduce((s, m) => s + (currentCounts[m.id] ?? (m.minCount ?? 0)), 0);
                          const model = cModels.find(m => m.id === modelId);
                          const count = currentCounts[modelId] ?? (model?.minCount ?? 0);
                          const effectiveMax = calcCase4ModelMax(model?.maxInRoster, effectiveCMax, cTotal, count);
                          const clamped = Math.min(effectiveMax, Math.max(model?.minCount ?? 0, val));
                          const newCounts = { ...currentCounts, [modelId]: clamped };
                          // Стоимость пересчитывается по суммарному числу моделей во всех контейнерах
                          const newTotalCount = allBoundedContainers.reduce(
                            (sum, c) => sum + (c.models ?? []).reduce((cs, m) => cs + (newCounts[m.id] ?? (m.minCount ?? 0)), 0),
                            0
                          );
                          const newCost = getCostForModelCount(bands, newTotalCount);
                          const updated = unitGroups.map(g => g.id === group.id
                            ? {
                                ...g,
                                units: g.units.map((u, idx) => idx === 0
                                  ? { ...u, modelCounts: newCounts, modelCount: newTotalCount, cost: newCost }
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
                            {allBoundedContainers.map(container => {
                              const cModels = container.models ?? [];
                              const cTotal = cModels.reduce((s, m) => s + (currentCounts[m.id] ?? (m.minCount ?? 0)), 0);
                              const cMin = container.minCount;
                              // Эффективный максимум контейнера (независимый для каждого контейнера в Case 4)
                              const effectiveCMax = calcCase4ContainerMax(container);
                              const isBelowMin = cMin !== undefined && cTotal < cMin;
                              const isAboveMax = cTotal > effectiveCMax;
                              const rangeStr = cMin !== undefined && cMin !== effectiveCMax
                                ? `${cMin}–${effectiveCMax}`
                                : String(effectiveCMax);
                              return (
                                <div key={container.id} className="unit-container-section">
                                  <div className="unit-container-section-header">
                                    <span className="unit-container-section-name">{container.name}</span>
                                    <span className={`unit-model-count-label${(isBelowMin || isAboveMax) ? ' unit-model-count-label--error' : ''}`}>
                                      {cTotal}/{rangeStr}
                                    </span>
                                  </div>
                                  <ul className="unit-nested-models unit-nested-models--roster">
                                    {cModels.map(model => {
                                      const count = currentCounts[model.id] ?? (model.minCount ?? 0);
                                      // per-N формула для моделей-специалистов; простая ёмкость для базовых
                                      const effectiveMax = calcCase4ModelMax(model.maxInRoster, effectiveCMax, cTotal, count);
                                      // Бинарный выбор (0 или 1): чекбокс вместо +/−
                                      // Если у модели нет явного maxInRoster, используем ёмкость контейнера (effectiveCMax)
                                      const isBinary = (model.minCount ?? 0) === 0 && (model.maxInRoster !== undefined ? model.maxInRoster === 1 : effectiveCMax === 1);
                                      return (
                                        <li key={model.id} className="unit-nested-model-item">
                                          <span className="unit-nested-model-name">
                                            {model.name}
                                            <span className="unit-type-badge">[M]</span>
                                          </span>
                                          {isBinary ? (
                                            <label className="unit-model-checkbox unit-model-checkbox--optional">
                                              <input
                                                type="checkbox"
                                                checked={count > 0}
                                                disabled={effectiveMax === 0}
                                                onChange={e => handleModelCountChange(container.id, model.id, e.target.checked ? 1 : 0)}
                                                aria-label={`Добавить ${model.name}`}
                                              />
                                            </label>
                                          ) : (
                                            <div className="unit-model-count">
                                              <span className="unit-model-count-label">Миниатюр:</span>
                                              <button
                                                type="button"
                                                className="unit-model-count-btn"
                                                onClick={() => handleModelCountChange(container.id, model.id, count - 1)}
                                                disabled={count <= (model.minCount ?? 0)}
                                                aria-label="Уменьшить количество миниатюр"
                                              >−</button>
                                              <input
                                                type="number"
                                                className="unit-model-count-input"
                                                value={count}
                                                min={model.minCount ?? 0}
                                                max={effectiveMax}
                                                onChange={e => {
                                                  const v = parseInt(e.target.value, 10);
                                                  if (!isNaN(v)) handleModelCountChange(container.id, model.id, v);
                                                }}
                                                aria-label="Количество миниатюр"
                                              />
                                              <button
                                                type="button"
                                                className="unit-model-count-btn"
                                                onClick={() => handleModelCountChange(container.id, model.id, count + 1)}
                                                disabled={count >= effectiveMax}
                                                aria-label="Увеличить количество миниатюр"
                                              >+</button>
                                            </div>
                                          )}
                                        </li>
                                      );
                                    })}
                                    {(isBelowMin || isAboveMax) && (
                                      <li className="unit-model-count-hint unit-model-count-hint--error">
                                        {isAboveMax
                                          ? `Максимум ${effectiveCMax} (выбрано: ${cTotal})`
                                          : `Необходимо не менее ${cMin} (выбрано: ${cTotal})`}
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              );
                            })}
                            <div className="unit-model-count-hint unit-model-count-hint--total">
                              Итого: {totalCount}
                            </div>
                          </>
                        );
                      }

                      // Случай 3: Blightlord/Deathshroud-подобный — один или несколько типов моделей + costBands на [U]
                      // Стоимость определяется по суммарному числу моделей через costBands
                      // Отличие от Poxwalkers (Case 2): контейнерный узел имеет явное ограничение maxCount (а не только minCount)
                      // Поддерживает как несколько типов моделей (Blightlord), так и один тип (Deathshroud Terminators)
                      // Поддерживает вложенные контейнеры (selectionEntryGroup из API): Plague Marines «Special weapons» (max=2),
                      // Kill Team «Core»/«Additional» и т.п. — рендерятся через renderFixedCompositionControls
                      const containerHasModels = (multiContainerForAll?.models ?? []).some(
                        m => m.entryType === 'model' || (m.entryType === undefined && m.models && m.models.length > 0)
                      );
                      if (multiContainerForAll && multiContainerForAll.maxCount !== undefined && primaryUnit.costBands?.length && containerHasModels) {
                        const containerModels = multiContainerForAll.models ?? [];
                        const minContainer = multiContainerForAll.minCount ?? 1;
                        const maxContainer = multiContainerForAll.maxCount ?? 99;
                        const bands = primaryUnit.costBands!;
                        // Прямые дочерние модели юнита с minCount > 0 — обязательные (например, Blightlord Champion)
                        const directModelChildren = (primaryUnit.models ?? []).filter(m => m.entryType === 'model' && (m.minCount ?? 0) > 0);
                        const mandatoryCount = directModelChildren.reduce((sum, m) => sum + m.minCount!, 0);
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        // Рекурсивный подсчёт включая модели из вложенных sub-containers
                        const containerTotal = countAllModels(containerModels, currentCounts);
                        // maxUnitSize = максимальный размер отряда (контейнер + обязательные)
                        const maxUnitSize = maxContainer + mandatoryCount;
                        const effectiveMaxContainer = maxContainer;
                        // Прямые [M]-модели — с calcEffectiveMax/isPrimaryContainerModel логикой
                        const directContainerModels = containerModels.filter(m => m.entryType === 'model');
                        // Вложенные контейнеры (selectionEntryGroup из API) — рендерятся через renderFixedCompositionControls
                        const subContainerGroups = containerModels.filter(m => m.entryType === undefined && m.models && m.models.length > 0);
                        const sortedDirectModels = [
                          ...directContainerModels.filter(m => isPrimaryContainerModel(m.maxInRoster, maxUnitSize)),
                          ...directContainerModels.filter(m => !isPrimaryContainerModel(m.maxInRoster, maxUnitSize)),
                        ];
                        // Предварительный расчёт занятых XOR-групп: exclusiveGroup → id выбранной модели.
                        const selectedInExclusiveGroup = new Map<string, string>();
                        for (const m of sortedDirectModels) {
                          if (m.exclusiveGroup && (currentCounts[m.id] ?? 0) > 0) {
                            selectedInExclusiveGroup.set(m.exclusiveGroup, m.id);
                          }
                        }

                        const handleModelCountChange = (modelId: string, val: number) => {
                          const directModel = directContainerModels.find(m => m.id === modelId);
                          let clamped: number;
                          if (directModel) {
                            // Для прямых [M] — полная логика calcEffectiveMax (per-N ограничения)
                            const otherTotal = containerTotal - (currentCounts[modelId] ?? (directModel.minCount ?? 0));
                            let effectiveMax = calcEffectiveMax(directModel.maxInRoster, effectiveMaxContainer, otherTotal, containerTotal + mandatoryCount, maxUnitSize);
                            // Взаимоисключающая группа: если другая модель из той же группы уже выбрана — блокируем
                            if (directModel.exclusiveGroup) {
                              const selectedId = selectedInExclusiveGroup.get(directModel.exclusiveGroup);
                              if (selectedId !== undefined && selectedId !== directModel.id) effectiveMax = 0;
                            }
                            clamped = Math.min(effectiveMax, Math.max(directModel.minCount ?? 0, val));
                          } else {
                            // Для моделей из sub-containers — ограничения (min/max/parentMax) уже применяет
                            // renderFixedCompositionControls через effectiveCap до вызова onCountChange,
                            // поэтому здесь достаточно защиты от отрицательных значений
                            clamped = Math.max(0, val);
                          }
                          const newCounts = { ...currentCounts, [modelId]: clamped };
                          // Рекурсивный пересчёт containerTotal (включая sub-container models)
                          const newContainerTotal = countAllModels(containerModels, newCounts);
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
                              {sortedDirectModels.map(model => {
                                const count = currentCounts[model.id] ?? (model.minCount ?? 0);
                                const otherTotal = containerTotal - count;
                                let effectiveMax = calcEffectiveMax(model.maxInRoster, effectiveMaxContainer, otherTotal, containerTotal + mandatoryCount, maxUnitSize);
                                // Взаимоисключающая группа: если другая модель из той же группы уже выбрана — блокируем
                                if (model.exclusiveGroup) {
                                  const selectedId = selectedInExclusiveGroup.get(model.exclusiveGroup);
                                  if (selectedId !== undefined && selectedId !== model.id) effectiveMax = 0;
                                }
                                const isPrimary = isPrimaryContainerModel(model.maxInRoster, maxUnitSize);
                                // Фиксированная модель (min === max > 0): отображаем как обязательную без контролов
                                const isFixed = model.minCount !== undefined && model.minCount > 0 && model.minCount === model.maxInRoster;
                                // Бинарный выбор (0 или 1): чекбокс вместо +/−
                                const isBinary = (model.minCount ?? 0) === 0 && (model.maxInRoster ?? 0) === 1;
                                return (
                                  <li key={model.id} className={`unit-nested-model-item${isPrimary ? ' unit-nested-model-item--primary' : ''}`}>
                                    <span className="unit-nested-model-name">
                                      {model.name}
                                      <span className="unit-type-badge">[M]</span>
                                    </span>
                                    {isFixed ? (
                                      model.minCount === 1 ? (
                                        <label className="unit-model-checkbox unit-model-checkbox--mandatory">
                                          <input type="checkbox" checked readOnly aria-label={`${model.name} (обязательно)`} />
                                        </label>
                                      ) : (
                                        <span className="unit-model-count-label">×{model.minCount}</span>
                                      )
                                    ) : isBinary ? (
                                      <label className="unit-model-checkbox unit-model-checkbox--optional">
                                        <input
                                          type="checkbox"
                                          checked={count > 0}
                                          disabled={effectiveMax === 0}
                                          onChange={e => handleModelCountChange(model.id, e.target.checked ? 1 : 0)}
                                          aria-label={`Добавить ${model.name}`}
                                        />
                                      </label>
                                    ) : (
                                      <div className="unit-model-count">
                                        <span className="unit-model-count-label">Миниатюр:</span>
                                        <button
                                          type="button"
                                          className="unit-model-count-btn"
                                          onClick={() => handleModelCountChange(model.id, count - 1)}
                                          disabled={count <= (model.minCount ?? 0)}
                                          aria-label="Уменьшить количество миниатюр"
                                        >−</button>
                                        <input
                                          type="number"
                                          className="unit-model-count-input"
                                          value={count}
                                          min={model.minCount ?? 0}
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
                                    )}
                                  </li>
                                );
                              })}
                              {/* Вложенные контейнеры (selectionEntryGroup): «Special weapons», «Heavy weapons» и т.п. */}
                              {subContainerGroups.length > 0 && renderFixedCompositionControls(
                                subContainerGroups,
                                currentCounts,
                                handleModelCountChange,
                              )}
                              {(containerTotal < minContainer || containerTotal > effectiveMaxContainer) && (
                                <li className="unit-model-count-hint">
                                  Итого: {containerTotal} / {effectiveMaxContainer} (мин. {minContainer})
                                </li>
                              )}
                            </ul>
                          </>
                        );
                      }

                      // Случай 1: отряд с несколькими типами моделей (Ironstrider-подобная структура)
                      // Если у [U] есть собственные costBands (Poxwalkers-подобный), пропускаем этот случай.
                      // Если модели в контейнере не имеют индивидуальных стоимостей, пропускаем этот случай —
                      // отряды с фиксированным составом рендерятся как стандартные (Exaction Squad и т.п.).
                      const containerHasCosts = (multiContainerForAll?.models ?? []).some(m => (m.cost ?? 0) > 0);
                      const multiContainer = !primaryUnit.costBands?.length && containerHasCosts
                        ? multiContainerForAll
                        : undefined;
                      if (multiContainer) {
                        const containerModels = multiContainer.models ?? [];
                        const minTotal = multiContainer.minCount ?? 1;
                        const maxTotal = multiContainer.maxCount ?? 99;
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        const totalCount = containerModels.reduce((sum, m) => sum + (currentCounts[m.id] ?? (m.minCount ?? 0)), 0);

                        const handleModelCountChange = (modelId: string, val: number) => {
                          const model = containerModels.find(m => m.id === modelId);
                          if (!model) return;
                          const otherTotal = totalCount - (currentCounts[modelId] ?? (model.minCount ?? 0));
                          const effectiveMax = calcEffectiveMax(model.maxInRoster, maxTotal, otherTotal);
                          const clamped = Math.min(effectiveMax, Math.max(model.minCount ?? 0, val));
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
                              const count = currentCounts[model.id] ?? (model.minCount ?? 0);
                              const otherTotal = totalCount - count;
                              const effectiveMax = calcEffectiveMax(model.maxInRoster, maxTotal, otherTotal);
                              // Бинарный выбор (0 или 1): чекбокс вместо +/−
                              const isBinary = (model.minCount ?? 0) === 0 && (model.maxInRoster ?? 0) === 1;
                              return (
                                <li key={model.id} className="unit-nested-model-item">
                                  <span className="unit-nested-model-name">
                                    {model.name}
                                    <span className="unit-type-badge">[M]</span>
                                  </span>
                                  {model.cost !== undefined && (
                                    <span className="unit-cost">{model.cost} pts</span>
                                  )}
                                  {isBinary ? (
                                    <label className="unit-model-checkbox unit-model-checkbox--optional">
                                      <input
                                        type="checkbox"
                                        checked={count > 0}
                                        disabled={effectiveMax === 0}
                                        onChange={e => handleModelCountChange(model.id, e.target.checked ? 1 : 0)}
                                        aria-label={`Добавить ${model.name}`}
                                      />
                                    </label>
                                  ) : (
                                    <div className="unit-model-count">
                                      <span className="unit-model-count-label">Миниатюр:</span>
                                      <button
                                        type="button"
                                        className="unit-model-count-btn"
                                        onClick={() => handleModelCountChange(model.id, count - 1)}
                                        disabled={count <= (model.minCount ?? 0)}
                                        aria-label="Уменьшить количество миниатюр"
                                      >−</button>
                                      <input
                                        type="number"
                                        className="unit-model-count-input"
                                        value={count}
                                        min={model.minCount ?? 0}
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
                                  )}
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
                      // Для юнитов с фиксированным составом и единой стоимостью (без переменных costBands)
                      // показываем интерактивные контролы для выбора опциональных миниатюр (Exaction Squad и т.п.)
                      if (!bands) {
                        const currentCounts = primaryUnit.modelCounts ?? {};
                        const handleCompositionCountChange = (modelId: string, val: number) => {
                          const newCounts = { ...currentCounts, [modelId]: val };
                          // Стоимость отряда не меняется — обновляем только modelCounts
                          const updated = unitGroups.map(g => g.id === group.id
                            ? {
                                ...g,
                                units: g.units.map((u, idx) => idx === 0
                                  ? { ...u, modelCounts: newCounts }
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
                            {renderFixedCompositionControls(
                              primaryUnit.models ?? [],
                              currentCounts,
                              handleCompositionCountChange,
                            )}
                          </ul>
                        );
                      }
                      const minM = bands?.[0].minModels ?? 0;
                      // undefined maxModels в последнем диапазоне означает «не ограничено сверху»;
                      // используем maxInRoster первой дочерней модели как фактический верхний предел
                      const firstChildModel = (primaryUnit.models ?? []).find(m => m.entryType === 'model');
                      const maxM = bands ? (bands[bands.length - 1].maxModels ?? firstChildModel?.maxInRoster ?? 99) : 0;
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
