import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useRosters } from '../contexts/RosterContext';

export function RosterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { rosters, editRoster, removeRoster } = useRosters();
  const roster = rosters.find(r => r.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(roster?.name || '');
  const [pointsLimit, setPointsLimit] = useState(roster?.pointsLimit || 2000);
  const [saving, setSaving] = useState(false);

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
            <input
              type="number"
              value={pointsLimit}
              onChange={e => setPointsLimit(Number(e.target.value))}
              className="form-input"
              min="1"
            />
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
            <h2>Отряды</h2>
            <div className="empty-state">
              <p>Добавление отрядов будет доступно в следующей версии</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
