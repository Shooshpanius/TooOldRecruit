import { useState, useEffect } from 'react';
import type { Unit } from '../types';
import { getUnits } from '../services/api';

interface AddUnitModalProps {
  factionId: string;
  factionName: string;
  onClose: () => void;
  onAdd: (unit: Unit) => void;
}

export function AddUnitModal({ factionId, factionName, onClose, onAdd }: AddUnitModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [openType, setOpenType] = useState<string | null>(null);

  useEffect(() => {
    getUnits(factionId).then(data => {
      setUnits(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [factionId]);

  const grouped = units.reduce<Record<string, Unit[]>>((acc, unit) => {
    if (!acc[unit.category]) acc[unit.category] = [];
    acc[unit.category].push(unit);
    return acc;
  }, {});

  const types = Object.keys(grouped);

  const toggleType = (type: string) => {
    setOpenType(prev => (prev === type ? null : type));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Добавить отряд — {factionName}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading">Загрузка отрядов...</div>
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
                      {grouped[type].map(unit => (
                        <li key={unit.id} className="unit-item">
                          <span className="unit-name">{unit.name}</span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => onAdd(unit)}
                          >
                            + Добавить
                          </button>
                        </li>
                      ))}
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
