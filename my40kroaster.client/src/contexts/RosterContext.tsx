import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Roster } from '../types';
import { useAuth } from './AuthContext';
import * as api from '../services/api';

interface RosterContextType {
  rosters: Roster[];
  loading: boolean;
  addRoster: (data: { name: string; factionId: string; factionName: string; pointsLimit: number }) => Promise<Roster>;
  removeRoster: (id: string) => Promise<void>;
  editRoster: (id: string, data: { name: string; pointsLimit: number }) => Promise<void>;
  refreshRosters: () => Promise<void>;
}

const RosterContext = createContext<RosterContextType | null>(null);

const LOCAL_STORAGE_KEY = 'local_rosters';

function loadLocalRosters(): Roster[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalRosters(rosters: Roster[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rosters));
}

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshRosters = useCallback(async () => {
    setLoading(true);
    try {
      if (token) {
        const data = await api.getRosters(token);
        setRosters(data);
      } else {
        setRosters(loadLocalRosters());
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshRosters();
  }, [refreshRosters]);

  const addRoster = useCallback(async (data: { name: string; factionId: string; factionName: string; pointsLimit: number }): Promise<Roster> => {
    if (token) {
      const roster = await api.createRoster(token, data);
      setRosters(prev => [roster, ...prev]);
      return roster;
    } else {
      const roster: Roster = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setRosters(prev => {
        const updated = [roster, ...prev];
        saveLocalRosters(updated);
        return updated;
      });
      return roster;
    }
  }, [token]);

  const removeRoster = useCallback(async (id: string) => {
    if (token) {
      await api.deleteRoster(token, id);
      setRosters(prev => prev.filter(r => r.id !== id));
    } else {
      setRosters(prev => {
        const updated = prev.filter(r => r.id !== id);
        saveLocalRosters(updated);
        return updated;
      });
    }
  }, [token]);

  const editRoster = useCallback(async (id: string, data: { name: string; pointsLimit: number }) => {
    if (token) {
      const updated = await api.updateRoster(token, id, data);
      setRosters(prev => prev.map(r => r.id === id ? updated : r));
    } else {
      setRosters(prev => {
        const updated = prev.map(r => r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r);
        saveLocalRosters(updated);
        return updated;
      });
    }
  }, [token]);

  return (
    <RosterContext.Provider value={{ rosters, loading, addRoster, removeRoster, editRoster, refreshRosters }}>
      {children}
    </RosterContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRosters() {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error('useRosters must be used within RosterProvider');
  return ctx;
}
