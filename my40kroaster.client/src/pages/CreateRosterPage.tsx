import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRosters } from '../contexts/RosterContext';
import { getFactions } from '../services/api';
import type { Faction } from '../types';

const POINTS_OPTIONS = [500, 1000, 1500, 2000, 2500];

export function CreateRosterPage() {
  const navigate = useNavigate();
  const { addRoster } = useRosters();
  const [factions, setFactions] = useState<Faction[]>([]);
  const [loadingFactions, setLoadingFactions] = useState(true);
  const [name, setName] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<Faction | null>(null);
  const [pointsLimit, setPointsLimit] = useState(2000);
  const [customPoints, setCustomPoints] = useState('');
  const [useCustomPoints, setUseCustomPoints] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getFactions().then(f => {
      setFactions(f);
      setLoadingFactions(false);
    });
  }, []);

  const filteredFactions = factions.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const effectivePoints = useCustomPoints ? (parseInt(customPoints) || 0) : pointsLimit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Введите название ростера'); return; }
    if (!selectedFaction) { setError('Выберите фракцию'); return; }
    if (effectivePoints < 1) { setError('Укажите количество очков'); return; }
    setSaving(true);
    setError('');
    try {
      const roster = await addRoster({
        name: name.trim(),
        factionId: selectedFaction.id,
        factionName: selectedFaction.name,
        pointsLimit: effectivePoints,
      });
      navigate(`/roster/${roster.id}`);
    } catch {
      setError('Ошибка при создании ростера');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="btn btn-back">← Назад</button>
        <h1>Новый ростер</h1>
      </header>

      <form onSubmit={handleSubmit} className="create-form">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Название ростера</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Мои космодесантники"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Лимит очков</label>
          <div className="points-selector">
            {POINTS_OPTIONS.map(p => (
              <button
                key={p}
                type="button"
                className={`points-option ${!useCustomPoints && pointsLimit === p ? 'active' : ''}`}
                onClick={() => { setPointsLimit(p); setUseCustomPoints(false); }}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className={`points-option ${useCustomPoints ? 'active' : ''}`}
              onClick={() => setUseCustomPoints(true)}
            >
              Своё
            </button>
          </div>
          {useCustomPoints && (
            <input
              type="number"
              value={customPoints}
              onChange={e => setCustomPoints(e.target.value)}
              placeholder="Введите количество очков"
              className="form-input"
              min="1"
              max="99999"
            />
          )}
        </div>

        <div className="form-group">
          <label>Фракция</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск фракции..."
            className="form-input"
          />
          {loadingFactions ? (
            <div className="loading">Загрузка фракций...</div>
          ) : (
            <div className="faction-list">
              {filteredFactions.map(faction => (
                <div
                  key={faction.id}
                  className={`faction-item ${selectedFaction?.id === faction.id ? 'selected' : ''}`}
                  onClick={() => setSelectedFaction(faction)}
                >
                  {faction.name}
                </div>
              ))}
              {filteredFactions.length === 0 && (
                <div className="no-results">Фракции не найдены</div>
              )}
            </div>
          )}
          {selectedFaction && (
            <div className="selected-faction">
              Выбрана: <strong>{selectedFaction.name}</strong>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary btn-full"
        >
          {saving ? 'Создание...' : 'Создать ростер'}
        </button>
      </form>
    </div>
  );
}
