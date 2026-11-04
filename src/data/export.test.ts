import { describe, expect, it } from 'vitest';
import { matchesToCsv, positionsToCsv, sessionToJson } from './export';
import type { MatchRecord, Session } from './types';

const session: Session = {
  id: 's1',
  startedAt: 0,
  endedAt: null,
  players: ['An', 'Bình', 'Chi', 'Dũng, Jr'].map((name, i) => ({
    id: `p${i + 1}`,
    name,
    skill: null,
    joinedAt: 0,
    leftAt: null,
  })),
};

const match: MatchRecord = {
  id: 'm1',
  sessionId: 's1',
  index: 1,
  startedAt: Date.UTC(2026, 10, 3, 19, 0),
  endedAt: Date.UTC(2026, 10, 3, 19, 15),
  lineup: { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' },
  events: [],
  finalScore: { near: 21, far: 18 },
  winner: 'near',
  videoFileName: 'van-01.mp4',
  calibrationId: null,
};

describe('xuất dữ liệu', () => {
  it('CSV kết quả ván có tên đội và thoát dấu phẩy', () => {
    const csv = matchesToCsv(session, [match]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('van,bat_dau,ket_thuc,doi_gan,doi_xa,diem_doi_gan,diem_doi_xa,doi_thang,video');
    expect(row).toBe(
      '1,2026-11-03T19:00:00.000Z,2026-11-03T19:15:00.000Z,An + Bình,"Chi + Dũng, Jr",21,18,An + Bình,van-01.mp4',
    );
  });

  it('CSV vị trí theo giây và mét', () => {
    const csv = positionsToCsv(session, match, [{ t: 1500, color: 'purple', x: 1.23456, y: 9 }]);
    expect(csv.trim().split('\n')[1]).toBe('1.50,Chi,purple,1.235,9.000');
  });

  it('JSON chứa buổi chơi và các ván', () => {
    const data = JSON.parse(sessionToJson(session, [match], 0));
    expect(data.session.players).toHaveLength(4);
    expect(data.matches[0].finalScore).toEqual({ near: 21, far: 18 });
  });
});
