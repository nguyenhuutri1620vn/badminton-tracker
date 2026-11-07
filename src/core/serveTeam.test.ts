import { describe, expect, it } from 'vitest';
import type { PlayerSample, PositionFrame } from './serveFormation';
import { guessServingTeams } from './serveTeam';
import type { Team } from './types';

const FRAME_MS = 125;

const standing: PlayerSample[] = [
  { id: 'blue', x: 1.6, y: 4.5 },
  { id: 'red', x: 3.8, y: 2.0 },
  { id: 'purple', x: 4.5, y: 8.9 },
  { id: 'yellow', x: 2.3, y: 11.4 },
];

/**
 * Đứng yên tới serveAt rồi phát: người nhận (đội còn lại) lao lên đỡ cầu sau receiveDelayMs,
 * đội phát đứng thêm serverDelayMs rồi mới di chuyển. Mỗi người chạy 3 m/s.
 */
function rally(serving: Team, serveAt: number, receiveDelayMs = 500, serverDelayMs = 1200, end = serveAt + 4000): PositionFrame[] {
  const frames: PositionFrame[] = [];
  for (let t = 0; t <= end; t += FRAME_MS) {
    frames.push({
      t,
      players: standing.map((p) => {
        const team: Team = p.y < 6.7 ? 'near' : 'far';
        const start = serveAt + (team === serving ? serverDelayMs : receiveDelayMs);
        const run = Math.max(0, t - start) / 1000;
        return { ...p, x: p.x + Math.min(run * 3, 1.5), y: p.y, metersPerPixel: team === 'far' ? 0.1 : 0.02 };
      }),
    });
  }
  return frames;
}

describe('đoán đội phát từ chuyển động', () => {
  it.each(['near', 'far'] as const)('đội %s phát: đội nhận di chuyển trước', (serving) => {
    const [guess] = guessServingTeams(rally(serving, 3000), [1000]);
    expect(guess).toMatchObject({ team: serving });
    // Thời điểm phát là lúc có người bắt đầu di chuyển sau lần dừng.
    expect(Math.abs(guess!.t - 3500)).toBeLessThan(600);
  });

  it('hai đội cùng di chuyển một lúc thì chưa đoán', () => {
    const [guess] = guessServingTeams(rally('near', 3000, 500, 500), [1000]);
    expect(guess!.team).toBeNull();
  });

  it('người ở xa rung vài pixel khi đứng chờ không bị coi là di chuyển', () => {
    const frames = rally('far', 3000).map((f, i) => ({
      ...f,
      players: f.players.map((p) => (p.y > 6.7 && f.t < 3000 ? { ...p, y: p.y + (i % 2 === 0 ? 0.15 : -0.15) } : p)),
    }));
    expect(guessServingTeams(frames, [1000])[0]).toMatchObject({ team: 'far' });
  });

  it('không ai di chuyển sau lần dừng thì không có lần phát', () => {
    const frames = rally('near', 1e9, 0, 0, 6000);
    expect(guessServingTeams(frames, [1000])).toEqual([]);
  });
});
