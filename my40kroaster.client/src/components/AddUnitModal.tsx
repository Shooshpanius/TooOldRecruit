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
  // undefined maxModels означает «не ограничено сверху» (открытый диапазон)
  const band = bands.find(b => count >= b.minModels && count <= (b.maxModels ?? Infinity));
  return band?.cost ?? bands[0].cost;
}

// Рекурсивно ищет первый дочерний [M] с диапазонами стоимости (через промежуточные контейнеры)
function findChildModelWithBands(models?: Unit[]): Unit | undefined {
  if (!models) return undefined;
  for (const m of models) {
    if (m.entryType === 'model' && m.costBands && m.costBands.length >= 1 &&
      (m.costBands.length > 1 || (m.costBands[0]?.minModels ?? 0) < (m.costBands[0]?.maxModels ?? Infinity))) {
      return m;
    }
    const found = findChildModelWithBands(m.models);
    if (found) return found;
  }
  return undefined;
}

// Рекурсивно собирает счётчики моделей для снимка состава: counts[id] ?? minCount ?? 0
function buildCompositionSnapshot(models: Unit[], counts: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of models) {
    if (m.entryType === 'model') {
      result[m.id] = counts[m.id] ?? m.minCount ?? 0;
    }
    if (m.models) Object.assign(result, buildCompositionSnapshot(m.models, counts));
  }
  return result;
}

// Рекурсивно считает сумму счётчиков всех [M]-узлов в дереве (включая вложенные контейнеры).
// Для моделей, ещё не затронутых пользователем (нет в counts), берём minCount ?? 0 как базу —
// это делает счётчик контейнера согласованным с отображаемыми значениями (shotgun min=4 → считается 4).
function countAllModels(models: Unit[], counts: Record<string, number>): number {
  return models.reduce((sum, m) => {
    if (m.entryType === 'model') return sum + (counts[m.id] ?? m.minCount ?? 0);
    if (m.models) return sum + countAllModels(m.models, counts);
    return sum;
  }, 0);
}

// Рекурсивно проверяет, удовлетворяет ли текущий набор счётчиков минимальным (и максимальным)
// требованиям всех контейнеров. Используется для блокировки кнопки «Добавить» при нарушении min.
function validateCompositionMinima(models: Unit[], counts: Record<string, number>): boolean {
  for (const m of models) {
    if (m.entryType === undefined && m.models && m.models.length > 0) {
      const subTotal = countAllModels(m.models, counts);
      if (m.minCount !== undefined && subTotal < m.minCount) return false;
      if (m.maxCount !== undefined && subTotal > m.maxCount) return false;
      if (!validateCompositionMinima(m.models, counts)) return false;
    }
  }
  return true;
}

// Интерактивный рендер состава отряда с фиксированной стоимостью.
// Отображает иерархию моделей с кнопками +/− для выбора опциональных миниатюр.
// Используется для отрядов с единой ценой, но переменным составом (Exaction Squad и т.п.):
//   - Фиксированные модели (minCount === maxInRoster > 0) → метка «×N (обязательно)», без контролов
//   - Опциональные/переменные модели → кнопки +/−, максимум ограничен лимитом контейнера
//   - Контейнеры («9 Exaction Vigilants», «Up to 2:») → заголовок с счётчиком N/max
function renderFixedCompositionControls(
  models: Unit[],
  counts: Record<string, number>,
  onCountChange: (modelId: string, newVal: number) => void,
  parentMaxCount?: number,
): React.ReactNode {
  // Суммарное количество всех моделей в текущем контексте (для расчёта лимита контейнера)
  const containerTotal = countAllModels(models, counts);
  return models.map(model => {
    if (model.entryType === undefined && model.models && model.models.length > 0) {
      // Контейнер-группа (например «9 Exaction Vigilants» или «Up to 2:»)
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
          <span className="unit-model-count-label">×{model.minCount} (обязательно)</span>
        </li>
      );
    }
    // Переменная / опциональная модель — показываем +/−
    const minCount = model.minCount ?? 0;
    const maxPerModel = model.maxInRoster ?? 0;
    const ownCount = counts[model.id] ?? minCount;
    // Свободных слотов в родительском контейнере: parentMax − (все остальные модели)
    const otherInContainer = containerTotal - ownCount;
    const effectiveMax = parentMaxCount !== undefined
      ? Math.min(maxPerModel, parentMaxCount - otherInContainer)
      : maxPerModel;
    // Нижняя граница: не ниже minCount, но и не выше effectiveMax (если контейнер переполнен)
    const effectiveCap = Math.max(effectiveMax, minCount);
    const setCount = (val: number) => {
      onCountChange(model.id, Math.max(minCount, Math.min(val, effectiveCap)));
    };
    return (
      <li key={model.id} className="unit-nested-model-item">
        <span className="unit-nested-model-name">
          {model.name}
          {model.entryType === 'model' && <span className="unit-type-badge">[M]</span>}
        </span>
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
      </li>
    );
  });
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

// Вычисляет эффективный максимум контейнера с учётом перекрёстных ограничений (Case 4).
// Если в юните есть «ведущий» контейнер с бо́льшим maxCount и отношение ratio = bigMax/smallMax —
// целое число > 1, то максимум = floor(totalОтВедущегоКонтейнера / ratio).
// Пример: Gun Servitors (max=2) при Acolytes (max=10): ratio=5 → max=floor(acolytesTotal/5).
// Результат: 0–4 агентов → max 0; 5–9 → max 1; 10 → max 2. Соответствует правилу игры.
function calcCase4ContainerMax(container: Unit, allContainers: Unit[], counts: Record<string, number>): number {
  const cMax = container.maxCount;
  if (cMax === undefined) return 99;
  for (const other of allContainers) {
    if (other.id === container.id) continue;
    const otherMax = other.maxCount;
    if (otherMax === undefined || otherMax <= cMax) continue;
    const ratio = otherMax / cMax;
    if (Number.isInteger(ratio) && ratio > 1) {
      const otherTotal = (other.models ?? []).reduce((s, m) => s + (counts[m.id] ?? 0), 0);
      return Math.floor(otherTotal / ratio);
    }
  }
  return cMax;
}

// Вычисляет эффективный максимум модели внутри контейнера (Case 4).
// Если maxInRoster < effectiveCMax и НОД > 1 — правило «perCount на каждые perN»:
//   effectiveMax = floor(cTotal / perN) * perCount, ограничено ёмкостью контейнера.
// Иначе — простое ограничение по оставшейся ёмкости: min(maxInRoster, effectiveCMax − others).
// Пример: специальный агент (maxInRoster=2) в 10-сильном контейнере: НОД=2, perN=5 →
//   effectiveMax = floor(cTotal/5), т.е. 1 специальный на каждые 5 агентов.
// Math.max(0, ...) гарантирует неотрицательный результат при переполнении контейнера.
function calcCase4ModelMax(modelMaxInRoster: number | undefined, effectiveCMax: number, cTotal: number, count: number): number {
  const maxPerModel = modelMaxInRoster ?? effectiveCMax;
  const otherInContainer = cTotal - count;
  // Применяем per-N формулу только когда модель меньше ёмкости и есть кратное отношение
  if (maxPerModel < effectiveCMax) {
    const g = gcd(maxPerModel, effectiveCMax);
    if (g > 1 && g < effectiveCMax) {
      const perN = effectiveCMax / g;
      const perCount = maxPerModel / g;
      const byRatio = Math.min(Math.floor(cTotal / perN) * perCount, maxPerModel);
      return Math.max(0, Math.min(byRatio, effectiveCMax - otherInContainer));
    }
  }
  return Math.max(0, Math.min(maxPerModel, effectiveCMax - otherInContainer));
}

// Возвращает «ведущий» контейнер — с наибольшим maxCount.
// Для Case 4: стоимость отряда считается по ведущему контейнеру (Acolytes, не Servitors),
// так как costBands калиброваны по числу агентов (5–10), а не по суммарному размеру отряда.
function findCase4PrimaryContainer(allContainers: Unit[]): Unit | undefined {
  return allContainers.reduce<Unit | undefined>((best, c) => {
    const bestMax = best?.maxCount ?? -1;
    return (c.maxCount ?? -1) > bestMax ? c : best;
  }, undefined);
}

// Определяет, является ли модель «только при минимальном размере отряда».
// Это ИСКЛЮЧИТЕЛЬНО модели с maxInRoster=1 (НОД(1, N) = 1 всегда).
// Пример: plague spewer+CCW (maxInRoster=1) — ровно 1 в отряде, доступна только при мин-размере.
// Модели с maxInRoster>1 и НОД>1 подпадают под «perCount на каждые perModels» (не мин-размер).
// Модели с maxInRoster>1 и НОД=1 (например combi-bolter, maxInRoster=9) — обычный абсолютный лимит.
function isMinSizeOnlyModel(modelMaxInRoster: number | undefined): boolean {
  return modelMaxInRoster === 1;
}

// Определяет, является ли модель «ведущей» — не зависит от числа других моделей через правило 1:N.
// Ведущие модели отображаются вверху списка.
// Модели с НОД=1 (combi-bolter, plague spewer) — ведущие.
// Модели с НОД>1 (flail "1 на 5", combi-weapon "3 на 5") — зависимые (secondary).
function isPrimaryContainerModel(modelMaxInRoster: number | undefined, maxUnitSize: number): boolean {
  if (modelMaxInRoster === undefined) return true;
  // Зависимые только когда НОД > 1 (есть групповое ограничение)
  return gcd(modelMaxInRoster, maxUnitSize) === 1;
}

// Вычисляет эффективный максимум для одного типа модели с учётом суммарного ограничения.
// Три случая на основе НОД(maxInRoster, maxUnitSize):
//   НОД > 1: правило «perCount на каждые perModels» (flail "1 на 5", combi-weapon "3 на 5")
//            effectiveMax = floor(totalCount / perModels) * perCount
//   НОД = 1, maxInRoster = 1: «только при минимальном размере» (plague spewer+CCW)
//            effectiveMax = 0 если totalCount > minUnitSize, иначе min(1, свободных мест)
//   НОД = 1, maxInRoster > 1: обычный абсолютный лимит (combi-bolter, maxInRoster=9)
//            effectiveMax = min(maxInRoster, свободных мест)
// maxTotal — эффективный максимум контейнера (может быть уменьшен до minContainer,
// если выбрана модель «только при минимальном размере»).
function calcEffectiveMax(
  modelMaxInRoster: number | undefined,
  maxTotal: number,
  otherTotal: number,
  totalCount?: number,
  maxUnitSize?: number,
  minUnitSize?: number,
): number {
  if (modelMaxInRoster !== undefined && totalCount !== undefined && maxUnitSize !== undefined) {
    const g = gcd(modelMaxInRoster, maxUnitSize);
    if (g > 1) {
      // Правило «perCount на каждые perModels моделей» (1-per-5, 3-per-5 и т.д.)
      const perModels = maxUnitSize / g;
      const perCount = modelMaxInRoster / g;
      const allowedByRatio = Math.min(Math.floor(totalCount / perModels) * perCount, modelMaxInRoster);
      return Math.min(allowedByRatio, maxTotal - otherTotal);
    }
    if (modelMaxInRoster === 1 && minUnitSize !== undefined) {
      // «Только при минимальном размере» (plague spewer+CCW)
      if (totalCount > minUnitSize) return 0;
      return Math.min(1, maxTotal - otherTotal);
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

    // Случай 4: юнит с несколькими независимыми контейнерами и переменной стоимостью по costBands.
    // Пример: Inquisitorial Agents — «1-2 Gun Servitors» + «5-10 Acolytes»,
    // суммарное количество моделей определяет стоимость через costBands на [U].
    // Каждый контейнер имеет собственный min/max, независимый от остальных.
    const allBoundedContainers = !isNested && unit.entryType === 'unit' && unit.costBands?.length
      ? findAllMultiModelContainers(unit.models)
      : [];

    if (allBoundedContainers.length >= 2) {
      // Суммарное количество по всем контейнерам → определяет стоимость через costBands
      const totalCount = allBoundedContainers.reduce(
        (sum, c) => sum + (c.models ?? []).reduce((cs, m) => cs + (modelCounts[m.id] ?? 0), 0),
        0
      );
      // Стоимость считается по «ведущему» контейнеру (наибольший maxCount = Acolytes),
      // т.к. costBands калиброваны под число агентов (5–10), а не суммарный размер с сервиторами.
      const primaryContainer = findCase4PrimaryContainer(allBoundedContainers);
      const primaryModelCount = (primaryContainer?.models ?? []).reduce((s, m) => s + (modelCounts[m.id] ?? 0), 0);
      const cost = getCostForModelCount(unit.costBands!, primaryModelCount);
      // Все контейнеры должны удовлетворять своим ограничениям с учётом перекрёстных зависимостей
      const containersValid = allBoundedContainers.every(c => {
        const cTotal = (c.models ?? []).reduce((s, m) => s + (modelCounts[m.id] ?? 0), 0);
        const effectiveCMax = calcCase4ContainerMax(c, allBoundedContainers, modelCounts);
        return (c.minCount === undefined || cTotal >= c.minCount) && cTotal <= effectiveCMax;
      });
      const canAdd = containersValid && (remainingPoints === undefined || cost <= remainingPoints);
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
                  modelCounts: Object.fromEntries(
                    allBoundedContainers.flatMap(c => (c.models ?? []).map(m => [m.id, modelCounts[m.id] ?? 0]))
                  ),
                  modelCount: primaryModelCount,
                })}
                disabled={!canAdd || limitReached}
                aria-label={attachMode ? 'Присоединить' : 'Добавить'}
              >
                +
              </button>
            </div>
          </div>
          {allBoundedContainers.map(container => {
            const cModels = container.models ?? [];
            const cTotal = cModels.reduce((s, m) => s + (modelCounts[m.id] ?? 0), 0);
            const cMin = container.minCount;
            // Эффективный максимум с учётом перекрёстных ограничений между контейнерами
            const effectiveCMax = calcCase4ContainerMax(container, allBoundedContainers, modelCounts);
            const isBelowMin = cMin !== undefined && cTotal < cMin;
            const isAboveMax = cTotal > effectiveCMax;
            // Показываем актуальный эффективный максимум (динамически меняется)
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
                <ul className="unit-nested-models">
                  {cModels.map(model => {
                    const count = modelCounts[model.id] ?? 0;
                    // per-N формула для моделей-специалистов; простая ёмкость для базовых моделей
                    const effectiveMax = calcCase4ModelMax(model.maxInRoster, effectiveCMax, cTotal, count);
                    return (
                      <li key={model.id} className="unit-nested-model-item">
                        <span className="unit-nested-model-name">
                          {model.name}
                          <span className="unit-type-badge">[M]</span>
                        </span>
                        <div className="unit-model-count">
                          <span className="unit-model-count-label">Миниатюр:</span>
                          <button
                            type="button"
                            className="unit-model-count-btn"
                            onClick={() => setModelCounts(prev => ({ ...prev, [model.id]: Math.max(0, count - 1) }))}
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
                              if (!isNaN(v)) setModelCounts(prev => ({ ...prev, [model.id]: Math.min(effectiveMax, Math.max(0, v)) }));
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
            Итого миниатюр: {totalCount}
          </div>
        </li>
      );
    }

    // Случай 3: Blightlord/Deathshroud-подобный — один или несколько типов моделей + стоимость по costBands на [U]
    // Отличие от Ironstrider: стоимость определяется по суммарному числу моделей через costBands, а не по сумме индивидуальных стоимостей
    // Отличие от Poxwalkers (Case 2): контейнерный узел имеет явное ограничение maxCount (а не только minCount)
    // Поддерживает как несколько типов моделей (Blightlord), так и один тип (Deathshroud Terminators)
    // Не применяется, если контейнер содержит вложенные контейнеры вместо прямых [M]-узлов
    // (пример: Fortis Kill Team — «Squad Members» содержит «Additional» и «Core» как субконтейнеры).
    const containerHasOnlyDirectModels = (multiContainerForAll?.models ?? []).every(m => m.entryType === 'model');
    if (multiContainerForAll && multiContainerForAll.maxCount !== undefined && unit.costBands?.length && (multiContainerForAll.models?.length ?? 0) >= 1 && containerHasOnlyDirectModels) {
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
        m => isMinSizeOnlyModel(m.maxInRoster) && (modelCounts[m.id] ?? 0) > 0
      );
      const effectiveMaxContainer = isMinSizeOnlySelected ? minContainer : maxContainer;
      const isValidTotal = containerTotal >= minContainer && containerTotal <= effectiveMaxContainer;
      const canAdd = isValidTotal && (remainingPoints === undefined || cost <= remainingPoints);
      const inRoster = countInRoster(unit.id);
      const limitReached = unit.maxInRoster !== undefined && inRoster >= unit.maxInRoster;
      // Ведущие модели (не зависят от числа других) — вверх списка
      const sortedContainerModels = [
        ...containerModels.filter(m => isPrimaryContainerModel(m.maxInRoster, maxUnitSize)),
        ...containerModels.filter(m => !isPrimaryContainerModel(m.maxInRoster, maxUnitSize)),
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
              const isPrimary = isPrimaryContainerModel(model.maxInRoster, maxUnitSize);
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

    // Случай 1 (Ironstrider): несколько типов моделей, стоимость — сумма индивидуальных.
    // Пропускаем этот случай если ни одна модель в контейнере не имеет индивидуальной стоимости:
    // отряды с фиксированным составом и единой стоимостью (Exaction Squad, Sisters of Battle и т.п.)
    // должны рендериться как стандартные с фиксированной ценой unit.cost.
    const containerHasCosts = (multiContainerForAll?.models ?? []).some(m => (m.cost ?? 0) > 0);
    const multiContainer = multiContainerForAll && !unit.costBands?.length && containerHasCosts
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
      (unit.costBands.length > 1 || (unit.costBands[0]?.minModels ?? 0) < (unit.costBands[0]?.maxModels ?? Infinity)));
    const minModels = hasBands ? unit.costBands![0].minModels : 1;
    // undefined maxModels в последнем диапазоне означает «не ограничено сверху»;
    // используем maxInRoster модели как фактический верхний предел для UI-контрола
    const maxModels = hasBands ? (unit.costBands![unit.costBands!.length - 1].maxModels ?? unit.maxInRoster ?? 99) : 1;
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
    // Признак отряда с фиксированной стоимостью и переменным составом (Exaction Squad и т.п.)
    // — состав редактируется через renderFixedCompositionControls, modelCounts передаётся в onAdd
    const hasVariableChildModels = !!(unit.costBands?.length || findChildModelWithBands(unit.models) !== undefined);
    const isFixedCompositionUnit = !isNested && unit.entryType === 'unit'
      && !!(unit.models && unit.models.length > 0) && !hasVariableChildModels;
    // Для фиксированных отрядов с несколькими контейнерами (Inquisitorial Agents и т.п.)
    // проверяем, что все контейнеры удовлетворяют своим минимальным требованиям
    const compositionValid = !isFixedCompositionUnit
      || validateCompositionMinima(unit.models ?? [], buildCompositionSnapshot(unit.models ?? [], modelCounts));
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
                onClick={() => {
                  // Для отрядов с фиксированным составом передаём modelCounts (выбор опциональных миниатюр)
                  const compositionCounts = isFixedCompositionUnit
                    ? buildCompositionSnapshot(unit.models ?? [], modelCounts)
                    : undefined;
                  onAdd({
                    ...unit,
                    cost: displayCost,
                    modelCount: hasBands ? (modelCounts[unit.id] ?? minModels) : childModelCount,
                    ...(compositionCounts ? { modelCounts: compositionCounts } : {}),
                  });
                }}
                disabled={!canAdd || !compositionValid || limitReached}
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
        {/* Список моделей:
            — для юнитов с переменной стоимостью (Poxwalkers и т.п.): интерактивные контролы через renderUnitItem
            — для юнитов с фиксированным составом и единой ценой (Exaction Squad и т.п.): +/− по составу */}
        {!isNested && unit.entryType === 'unit' && unit.models && unit.models.length > 0 && (
          <ul className="unit-nested-models">
            {hasVariableChildModels
              ? unit.models.map(child => renderUnitItem(child, depth + 1))
              : renderFixedCompositionControls(
                  unit.models,
                  modelCounts,
                  (id, val) => setModelCounts(prev => ({ ...prev, [id]: val })),
                )
            }
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
