export interface MatchRecord {
  id: string;
  timestamp: number;
  map: string;
  isWin: boolean;
  title: string;
  durationSeconds: number;
  kills: number;
  peakTroops: number;
  finalTiles: number;
  territoryPercent: number;
}

export interface MatchStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalKills: number;
  bestTerritoryPercent: number;
}

const STORAGE_KEY = "ironfront_match_history_v1";
const MAX_RECORDS = 50;

export class MatchHistoryStore {
  public static getAll(): MatchRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => b.timestamp - a.timestamp);
      }
      return [];
    } catch {
      return [];
    }
  }

  public static add(record: Omit<MatchRecord, "id">): MatchRecord {
    const list = this.getAll();
    const newRecord: MatchRecord = {
      ...record,
      id: "match_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    };
    list.unshift(newRecord);
    if (list.length > MAX_RECORDS) {
      list.length = MAX_RECORDS;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("Failed to save match history to localStorage", e);
    }
    return newRecord;
  }

  public static clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear match history", e);
    }
  }

  public static getStats(): MatchStats {
    const all = this.getAll();
    const total = all.length;
    if (total === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalKills: 0,
        bestTerritoryPercent: 0,
      };
    }

    const wins = all.filter((m) => m.isWin).length;
    const losses = total - wins;
    const winRate = Math.round((wins / total) * 100);
    const totalKills = all.reduce((sum, m) => sum + (m.kills || 0), 0);
    const bestTerritoryPercent = Math.max(
      0,
      ...all.map((m) => m.territoryPercent || 0),
    );

    return {
      total,
      wins,
      losses,
      winRate,
      totalKills,
      bestTerritoryPercent,
    };
  }
}
