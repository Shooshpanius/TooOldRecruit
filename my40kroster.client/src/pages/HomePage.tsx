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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Удалить ростер "${name}"?`)) return;
    setDeletingId(id);
    try {
      await removeRoster(id);
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
          <div className="section-header-actions">
            <button onClick={() => navigate('/catalog')} className="btn btn-secondary">
              📖 Каталог
            </button>
            <button onClick={() => navigate('/create')} className="btn btn-primary">
              + Новый ростер
            </button>
          </div>
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
          <div className="roster-grid">
            {rosters.map(roster => (
              <div key={roster.id} className="roster-card">
                <div className="roster-card-header">
                  <h3>{roster.name}</h3>
                  <span className="points-badge">{roster.pointsLimit} очков</span>
                </div>
                <div className="roster-card-body">
                  <p className="faction-label">{roster.factionName}</p>
                  {roster.detachmentName && (
                    <p className="faction-label">{roster.detachmentName}</p>
                  )}
                </div>
                <div className="roster-card-footer">
                  <button
                    onClick={() => navigate(`/roster/${roster.id}`)}
                    className="btn btn-primary"
                  >
                    Открыть
                  </button>
                  <button
                    onClick={() => handleDelete(roster.id, roster.name)}
                    disabled={deletingId === roster.id}
                    className="btn btn-danger"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
