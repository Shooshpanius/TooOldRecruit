import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRosters } from '../contexts/RosterContext';
import { GoogleLoginButton } from '../components/GoogleLoginButton';
import { LAST_PR_NUMBER, LAST_PR_DATE } from '../version';

export function HomePage() {
  const { user, signOut } = useAuth();
  const { rosters, loading, removeRoster } = useRosters();
  const navigate = useNavigate();
  const [selectedRosterId, setSelectedRosterId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedRoster = rosters.find(r => r.id === selectedRosterId) ?? null;

  const handleDelete = async () => {
    if (!selectedRoster) return;
    if (!confirm(`Удалить ростер "${selectedRoster.name}"?`)) return;
    setDeletingId(selectedRoster.id);
    try {
      await removeRoster(selectedRoster.id);
      setSelectedRosterId('');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>⚔️ Too Old Recruit ⚔️</h1>
        <p className="subtitle">Warhammer 40,000 — 10-я редакция</p>
        <p className="version-badge">Beta version #0.0.{LAST_PR_NUMBER} от {LAST_PR_DATE}</p>
        {user ? (
          <div className="user-info">
            {user.picture && <img src={user.picture} alt={user.name} className="avatar" />}
            <span>{user.name}</span>
            <button onClick={signOut} className="btn btn-secondary btn-sm">Выйти</button>
          </div>
        ) : (
          <div className="auth-section">
            <p>Войдите, чтобы сохранять ростеры на сервере</p>
            <GoogleLoginButton />
          </div>
        )}
      </header>

      <main>
        <div className="section-header">
          <h2>Мои ростеры</h2>
          <button onClick={() => navigate('/create')} className="btn btn-primary">
            + Новый ростер
          </button>
        </div>

        {!user && (
          <div className="info-banner">
            📱 Ростеры сохраняются локально. Войдите через Google для синхронизации.
          </div>
        )}

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : rosters.length === 0 ? (
          <div className="empty-state">
            <p>У вас ещё нет ростеров</p>
            <button onClick={() => navigate('/create')} className="btn btn-primary">
              Создать первый ростер
            </button>
          </div>
        ) : (
          <div className="roster-selector">
            <select
              value={selectedRosterId}
              onChange={e => setSelectedRosterId(e.target.value)}
              className="form-input"
            >
              <option value="">— Выберите ростер —</option>
              {rosters.map(roster => (
                <option key={roster.id} value={roster.id}>
                  {roster.name} ({roster.factionName}, {roster.pointsLimit} очков)
                </option>
              ))}
            </select>
            {selectedRoster && (
              <div className="roster-selector-actions">
                <button
                  onClick={() => navigate(`/roster/${selectedRoster.id}`)}
                  className="btn btn-primary"
                >
                  Открыть
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deletingId === selectedRoster.id}
                  className="btn btn-danger"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
