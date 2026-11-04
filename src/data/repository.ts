import type { CalibrationProfile, MatchRecord, PositionSample, Session } from './types';

const DB_VERSION = 1;

const STORES = {
  sessions: 'sessions',
  matches: 'matches',
  positions: 'positions',
  calibrations: 'calibrations',
  settings: 'settings',
} as const;

/** Một bản ghi vị trí gom nhiều mẫu để không phải ghi hàng chục nghìn dòng nhỏ. */
interface PositionChunk {
  matchId: string;
  seq: number;
  samples: PositionSample[];
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openDatabase(name = 'badminton-tracker', factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const request = factory.open(name, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore(STORES.sessions, { keyPath: 'id' });
    const matches = db.createObjectStore(STORES.matches, { keyPath: 'id' });
    matches.createIndex('sessionId', 'sessionId');
    db.createObjectStore(STORES.positions, { keyPath: ['matchId', 'seq'] });
    db.createObjectStore(STORES.calibrations, { keyPath: 'id' });
    db.createObjectStore(STORES.settings);
  };
  return promisify(request);
}

/** Lưu trữ cục bộ trên MacBook (IndexedDB của Chrome). */
export class Repository {
  private positionSeq = new Map<string, number>();

  constructor(private readonly db: IDBDatabase) {}

  static async open(name?: string, factory?: IDBFactory): Promise<Repository> {
    return new Repository(await openDatabase(name, factory));
  }

  close(): void {
    this.db.close();
  }

  private async put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await transactionDone(tx);
  }

  private get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return promisify(this.db.transaction(store).objectStore(store).get(key));
  }

  private getAll<T>(store: string): Promise<T[]> {
    return promisify(this.db.transaction(store).objectStore(store).getAll());
  }

  // Buổi chơi

  saveSession(session: Session): Promise<void> {
    return this.put(STORES.sessions, session);
  }

  getSession(id: string): Promise<Session | undefined> {
    return this.get(STORES.sessions, id);
  }

  async listSessions(): Promise<Session[]> {
    const sessions = await this.getAll<Session>(STORES.sessions);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Buổi chơi chưa kết thúc gần nhất, để mở lại app giữa buổi. */
  async getActiveSession(): Promise<Session | undefined> {
    return (await this.listSessions()).find((s) => s.endedAt === null);
  }

  // Ván

  saveMatch(match: MatchRecord): Promise<void> {
    return this.put(STORES.matches, match);
  }

  getMatch(id: string): Promise<MatchRecord | undefined> {
    return this.get(STORES.matches, id);
  }

  async listMatches(sessionId: string): Promise<MatchRecord[]> {
    const index = this.db.transaction(STORES.matches).objectStore(STORES.matches).index('sessionId');
    const matches = await promisify(index.getAll(sessionId) as IDBRequest<MatchRecord[]>);
    return matches.sort((a, b) => a.index - b.index);
  }

  /** Ván đang dở (đã Start, chưa End) của buổi, để khôi phục khi mở lại app. */
  async getOpenMatch(sessionId: string): Promise<MatchRecord | undefined> {
    return (await this.listMatches(sessionId)).find((m) => m.endedAt === null);
  }

  // Vị trí

  async appendPositions(matchId: string, samples: PositionSample[]): Promise<void> {
    if (samples.length === 0) return;
    let seq = this.positionSeq.get(matchId);
    if (seq === undefined) seq = await this.countPositionChunks(matchId);
    const chunk: PositionChunk = { matchId, seq, samples };
    this.positionSeq.set(matchId, seq + 1);
    await this.put(STORES.positions, chunk);
  }

  private countPositionChunks(matchId: string): Promise<number> {
    const range = IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]);
    return promisify(this.db.transaction(STORES.positions).objectStore(STORES.positions).count(range));
  }

  async getPositions(matchId: string): Promise<PositionSample[]> {
    const range = IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]);
    const store = this.db.transaction(STORES.positions).objectStore(STORES.positions);
    const chunks = await promisify(store.getAll(range) as IDBRequest<PositionChunk[]>);
    return chunks.sort((a, b) => a.seq - b.seq).flatMap((c) => c.samples);
  }

  // Calibrate

  saveCalibration(profile: CalibrationProfile): Promise<void> {
    return this.put(STORES.calibrations, profile);
  }

  getCalibration(id: string): Promise<CalibrationProfile | undefined> {
    return this.get(STORES.calibrations, id);
  }

  async listCalibrations(): Promise<CalibrationProfile[]> {
    const profiles = await this.getAll<CalibrationProfile>(STORES.calibrations);
    return profiles.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Cài đặt (giá trị bất kỳ clone được, kể cả FileSystemDirectoryHandle)

  getSetting<T>(key: string): Promise<T | undefined> {
    return this.get(STORES.settings, key);
  }

  setSetting(key: string, value: unknown): Promise<void> {
    return this.put(STORES.settings, value, key);
  }
}
