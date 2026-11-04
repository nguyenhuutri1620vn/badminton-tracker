import { describe, expect, it } from 'vitest';
import {
  SessionError,
  activePlayers,
  addPlayer,
  createSession,
  gamesPlayed,
  markLeft,
  markReturned,
  playersOfTeam,
  renamePlayer,
  validateLineup,
} from './session';
import type { MatchRecord, Session } from '../data/types';

function sessionWith(...names: string[]): Session {
  return names.reduce((s, name, i) => addPlayer(s, `p${i + 1}`, name, i), createSession('s1', 0));
}

describe('người chơi trong buổi', () => {
  it('thêm người, chuẩn hóa khoảng trắng', () => {
    const session = addPlayer(createSession('s1', 0), 'p1', '  Nguyễn   An ', 5);
    expect(session.players[0]).toMatchObject({ name: 'Nguyễn An', joinedAt: 5, leftAt: null, skill: null });
  });

  it('không cho tên trống hoặc trùng (không phân biệt hoa thường)', () => {
    const session = sessionWith('An');
    expect(() => addPlayer(session, 'p2', '   ', 1)).toThrow(SessionError);
    expect(() => addPlayer(session, 'p2', 'an', 1)).toThrow(SessionError);
  });

  it('người đến muộn được thêm giữa buổi', () => {
    const session = addPlayer(sessionWith('An', 'Bình'), 'p3', 'Chi', 3_600_000);
    expect(activePlayers(session).map((p) => p.name)).toEqual(['An', 'Bình', 'Chi']);
  });

  it('người về sớm không còn trong danh sách có mặt, có thể quay lại', () => {
    let session = markLeft(sessionWith('An', 'Bình'), 'p1', 100);
    expect(activePlayers(session).map((p) => p.id)).toEqual(['p2']);
    session = markReturned(session, 'p1');
    expect(activePlayers(session)).toHaveLength(2);
  });

  it('đổi tên', () => {
    const session = renamePlayer(sessionWith('An', 'Bình'), 'p1', 'An Lớn');
    expect(session.players[0]?.name).toBe('An Lớn');
    expect(() => renamePlayer(session, 'p1', 'bình')).toThrow(SessionError);
  });
});

describe('đội hình ván', () => {
  const session = markLeft(sessionWith('An', 'Bình', 'Chi', 'Dũng', 'Em'), 'p5', 1);

  it('hợp lệ khi đủ 4 người khác nhau đang có mặt', () => {
    expect(validateLineup(session, { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' })).toEqual([]);
  });

  it('báo thiếu người, trùng người, người đã về', () => {
    expect(validateLineup(session, { blue: 'p1', red: 'p2', purple: 'p3' })).toContain('Cần chọn đủ 4 người cho 4 màu');
    expect(validateLineup(session, { blue: 'p1', red: 'p1', purple: 'p3', yellow: 'p4' })).toContain(
      'Mỗi người chỉ được mang một màu',
    );
    expect(validateLineup(session, { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p5' })).toContain('Em đã về');
  });

  it('xanh và đỏ là đội gần, tím và vàng là đội xa', () => {
    const lineup = { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' };
    expect(playersOfTeam(lineup, 'near')).toEqual(['p1', 'p2']);
    expect(playersOfTeam(lineup, 'far')).toEqual(['p3', 'p4']);
  });
});

describe('số ván đã chơi', () => {
  it('chỉ đếm ván đã kết thúc', () => {
    const session = sessionWith('An', 'Bình', 'Chi', 'Dũng', 'Em');
    const base = { sessionId: 's1', startedAt: 0, events: [], finalScore: null, winner: null, videoFileName: null, calibrationId: null };
    const matches: MatchRecord[] = [
      { ...base, id: 'm1', index: 1, endedAt: 1, lineup: { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' } },
      { ...base, id: 'm2', index: 2, endedAt: null, lineup: { blue: 'p5', red: 'p2', purple: 'p3', yellow: 'p4' } },
    ];
    const counts = gamesPlayed(session, matches);
    expect(counts.get('p1')).toBe(1);
    expect(counts.get('p5')).toBe(0);
  });
});
