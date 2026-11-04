import { describe, expect, it } from 'vitest';
import { ServeFormationDetector, type PlayerSample } from './serveFormation';
import { formation, moving } from './testing/positions';

const FPS = 15;
const FRAME_MS = 1000 / FPS;

/** Đưa các khung hình vào detector trong durationMs, trả về các quan sát phát ra. */
function feed(
  detector: ServeFormationDetector,
  startT: number,
  durationMs: number,
  players: (t: number) => PlayerSample[],
) {
  const emitted = [];
  for (let t = startT; t < startT + durationMs; t += FRAME_MS) {
    const obs = detector.push({ t, players: players(t) });
    if (obs) emitted.push(obs);
  }
  return emitted;
}

const jitter = (samples: PlayerSample[], t: number) =>
  samples.map((p) => ({ ...p, x: p.x + Math.sin(t) * 0.03, y: p.y + Math.cos(t) * 0.03 }));

describe('ServeFormationDetector', () => {
  it.each([
    ['near', 'right'],
    ['near', 'left'],
    ['far', 'right'],
    ['far', 'left'],
  ] as const)('nhận ra đội %s phát từ ô %s sau khi đứng yên 1 giây', (team, court) => {
    const detector = new ServeFormationDetector();
    const emitted = feed(detector, 0, 1500, (t) => jitter(formation(team, court), t));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ servingTeam: team, court });
    expect(emitted[0]!.confidence).toBeGreaterThanOrEqual(0.8);
    // blue và purple đứng trước, ở ô của lần phát này.
    const other = court === 'right' ? 'left' : 'right';
    expect(emitted[0]!.courtPlayers).toEqual({
      near: { [court]: 'blue', [other]: 'red' },
      far: { [court]: 'purple', [other]: 'yellow' },
    });
  });

  it('chưa đứng yên đủ 1 giây thì không phát ra quan sát', () => {
    const detector = new ServeFormationDetector();
    expect(feed(detector, 0, 800, () => formation('near', 'right'))).toHaveLength(0);
  });

  it('đang di chuyển thì không phát ra quan sát', () => {
    const detector = new ServeFormationDetector();
    expect(feed(detector, 0, 3000, moving)).toHaveLength(0);
  });

  it('chỉ phát ra một lần cho mỗi đội hình, phát lại sau khi có pha đánh', () => {
    const detector = new ServeFormationDetector();
    const first = feed(detector, 0, 3000, () => formation('near', 'right'));
    const rally = feed(detector, 3000, 4000, moving);
    const second = feed(detector, 7000, 1500, () => formation('near', 'left'));
    expect(first).toHaveLength(1);
    expect(rally).toHaveLength(0);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ servingTeam: 'near', court: 'left' });
  });

  it('người phát và người nhận không đứng chéo nhau thì không phải đội hình phát cầu', () => {
    const detector = new ServeFormationDetector();
    const notDiagonal = formation('near', 'right').map((p) => (p.id === 'purple' ? { ...p, x: 4.5 } : p));
    expect(feed(detector, 0, 1500, () => notDiagonal)).toHaveLength(0);
  });

  it('không đủ 2 người mỗi bên sân thì bỏ qua', () => {
    const detector = new ServeFormationDetector();
    const threeNear = formation('near', 'right').map((p) => (p.id === 'yellow' ? { ...p, y: 3 } : p));
    expect(feed(detector, 0, 1500, () => threeNear)).toHaveLength(0);
  });

  it('không có tín hiệu tay: vẫn phát ra quan sát với đội phát chưa rõ', () => {
    const detector = new ServeFormationDetector();
    const emitted = feed(detector, 0, 1500, () => formation('far', 'left', false));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ servingTeam: null, court: 'left' });
  });
});
