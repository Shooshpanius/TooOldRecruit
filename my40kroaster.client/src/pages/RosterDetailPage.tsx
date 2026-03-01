import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useRosters } from '../contexts/RosterContext';
import { useAuth } from '../contexts/AuthContext';
import { AddUnitModal } from '../components/AddUnitModal';
import type { RosterUnit, UnitGroup } from '../types';
import * as api from '../services/api';

const POINTS_OPTIONS = [500, 1000, 1500, 2000, 2500];

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
  const [saving, setSaving] = useState(false);
  const [unitAddTarget, setUnitAddTarget] = useState<{ groupId: string | null }>({ groupId: null });
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitGroups, setUnitGroups] = useState<UnitGroup[]>([]);

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
      await editRoster(roster.id, { name, pointsLimit });
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
            onClick={() => { setEditing(!editing); setName(roster.name); setPointsLimit(roster.pointsLimit); }}
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
                        <span className="unit-group-primary-name">{primaryUnit.name}</span>
                        <span className="roster-unit-type">{primaryUnit.category}</span>
                        {primaryUnit.cost !== undefined && (
                          <span className="unit-cost">{primaryUnit.cost} pts</span>
                        )}
                      </div>
                      <div className="unit-group-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setUnitAddTarget({ groupId: group.id }); setAddingUnit(true); }}
                        >
                          + Присоединить
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
                            <span className="roster-unit-type">{unit.category}</span>
                            <span className="unit-group-attached-name">{unit.name}</span>
                            {unit.cost !== undefined && (
                              <span className="unit-cost">{unit.cost} pts</span>
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
              onClose={() => setAddingUnit(false)}
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
