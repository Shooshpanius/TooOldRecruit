import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useRosters } from '../contexts/RosterContext';
import { useAuth } from '../contexts/AuthContext';
import { AddUnitModal } from '../components/AddUnitModal';
import type { RosterUnit, UnitGroup, UnitCostBand, ModelEntry } from '../types';
import * as api from '../services/api';

const POINTS_OPTIONS = [500, 1000, 1500, 2000, 2500];

function getCostForModelCount(bands: UnitCostBand[], count: number): number {
  const band = bands.find(b => count >= b.minModels && count <= b.maxModels);
  return band?.cost ?? bands[0].cost;
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

  const hasLegendsUnits = unitGroups.some(group =>
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
                          {primaryUnit.hasVariableCost && <span className="unit-variable-badge">[M]</span>}
                        </span>
                        <div className="unit-group-meta">
                          <span className="roster-unit-type">{primaryUnit.category}</span>
                          {primaryUnit.cost !== undefined && (
                            <span className="unit-cost">{primaryUnit.cost} pts</span>
                          )}
                        </div>
                        {/* Для контейнеров типа unit — вложенные модели без счётчика на самом unit */}
                        {primaryUnit.entryType === 'unit' && primaryUnit.models && primaryUnit.models.length > 0
                          ? (
                            <ul className="unit-models-list">
                              {primaryUnit.models.map((model: ModelEntry, modelIndex: number) => {
                                const hasBands = !!(model.costBands && model.costBands.length >= 1 &&
                                  (model.costBands.length > 1 || model.costBands[0].minModels < model.costBands[0].maxModels));
                                const bands = model.costBands ?? [];
                                const minM = bands.length > 0 ? bands[0].minModels : 1;
                                const maxM = bands.length > 0 ? bands[bands.length - 1].maxModels : 1;
                                const currentCount = model.modelCount ?? minM;
                                const setModelCount = (val: number) => {
                                  const clamped = Math.min(maxM, Math.max(minM, val));
                                  const newModelCost = getCostForModelCount(bands, clamped);
                                  const updated = unitGroups.map(g => g.id === group.id
                                    ? {
                                        ...g,
                                        units: g.units.map((u, idx) => {
                                          if (idx !== 0) return u;
                                          const newModels = (u.models ?? []).map((m, i) =>
                                            i === modelIndex ? { ...m, modelCount: clamped, cost: newModelCost } : m
                                          );
                                          const newCost = newModels.reduce((sum, m) => sum + (m.cost ?? 0), 0);
                                          return { ...u, models: newModels, cost: newCost };
                                        })
                                      }
                                    : g
                                  );
                                  setUnitGroups(updated);
                                  persistUnits(updated);
                                };
                                return (
                                  <li key={model.id} className="unit-model-item">
                                    <div className="unit-model-item-info">
                                      <span className="unit-model-item-name">{model.name}</span>
                                      {model.cost !== undefined && (
                                        <span className="unit-cost">{model.cost} pts</span>
                                      )}
                                    </div>
                                    {hasBands && (
                                      <div className="unit-model-count">
                                        <span className="unit-model-count-label">Моделей:</span>
                                        <button
                                          type="button"
                                          className="unit-model-count-btn"
                                          onClick={() => setModelCount(currentCount - 1)}
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
                                            if (!isNaN(val)) setModelCount(val);
                                          }}
                                          aria-label="Количество моделей"
                                        />
                                        <button
                                          type="button"
                                          className="unit-model-count-btn"
                                          onClick={() => setModelCount(currentCount + 1)}
                                          disabled={currentCount >= maxM}
                                          aria-label="Увеличить количество моделей"
                                        >+</button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )
                          : primaryUnit.costBands && primaryUnit.costBands.length > 1 && (() => {
                          const bands = primaryUnit.costBands;
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
                        {group.units.slice(1).map((unit) => (
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
                        ))}
                      </ul>
                    )}
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
