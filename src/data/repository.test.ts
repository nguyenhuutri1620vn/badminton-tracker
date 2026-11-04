import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';
import type { MatchRecord, Session } from './types';

let repo: Repository;
let dbCounter = 0;

beforeEach(async () => {
  dbCounter += 1;
  repo = await Repository.open(`test-${dbCounter}`);
});

afterEach(() => repo.close());

const session = (id: string, startedAt: number, endedAt: number | null = null): Session => ({
  id,
  startedAt,
  endedAt,
  players: [{ id: 'p1', name: 'An', skill: null, joinedAt: startedAt, leftAt: null }],
});

const match = (id: string, sessionId: string, index: number, endedAt: number | null = 2): MatchRecord => ({
  id,
  sessionId,
  index,
  startedAt: 1,
  endedAt,
  lineup: { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' },
  events: [{ type: 'serve', id: 's1', t: 0, servingTeam: 'near', court: 'right', confidence: 0.9 }],
  finalScore: null,
  winner: null,
  videoFileName: null,
  calibrationId: null,
});

describe('Repository', () => {
  it('lưu và đọc lại buổi chơi, tìm buổi đang diễn ra', async () => {
    await repo.saveSession(session('old', 1, 5));
    await repo.saveSession(session('now', 10));
    expect((await repo.getSession('now'))?.players[0]?.name).toBe('An');
    expect((await repo.listSessions()).map((s) => s.id)).toEqual(['now', 'old']);
    expect((await repo.getActiveSession())?.id).toBe('now');
  });

  it('liệt kê ván theo buổi, đúng thứ tự, tìm ván đang dở', async () => {
    await repo.saveMatch(match('m2', 's1', 2, null));
    await repo.saveMatch(match('m1', 's1', 1));
    await repo.saveMatch(match('x', 's2', 1));
    const matches = await repo.listMatches('s1');
    expect(matches.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(matches[0]?.events[0]).toMatchObject({ type: 'serve', servingTeam: 'near' });
    expect((await repo.getOpenMatch('s1'))?.id).toBe('m2');
  });

  it('ghi vị trí theo từng đợt và đọc lại đúng thứ tự, kể cả sau khi mở lại', async () => {
    await repo.appendPositions('m1', [{ t: 0, color: 'blue', x: 1, y: 2 }]);
    await repo.appendPositions('m1', [{ t: 100, color: 'red', x: 3, y: 4 }]);
    await repo.appendPositions('m2', [{ t: 0, color: 'blue', x: 9, y: 9 }]);

    const reopened = new Repository((repo as unknown as { db: IDBDatabase }).db);
    await reopened.appendPositions('m1', [{ t: 200, color: 'purple', x: 5, y: 6 }]);

    expect((await repo.getPositions('m1')).map((p) => p.t)).toEqual([0, 100, 200]);
    expect(await repo.getPositions('m2')).toHaveLength(1);
  });

  it('lưu calibrate và cài đặt', async () => {
    await repo.saveCalibration({
      id: 'c1',
      name: 'Sân A',
      createdAt: 1,
      imageWidth: 1920,
      imageHeight: 1080,
      imageCorners: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    });
    expect((await repo.listCalibrations())[0]?.name).toBe('Sân A');
    await repo.setSetting('lastCalibrationId', 'c1');
    expect(await repo.getSetting('lastCalibrationId')).toBe('c1');
    expect(await repo.getSetting('missing')).toBeUndefined();
  });
});
