import { describe, expect, it } from 'vitest';
import { courtForScore } from './rules';
import { MatchEngine } from './scoreEngine';
import { ServeFormationDetector } from './serveFormation';
import { formation, moving } from './testing/positions';
import type { CourtPlayers, Score, Team } from './types';

const FRAME_MS = 1000 / 15;

/**
 * Mô phỏng cả ván từ danh sách đội thắng từng pha: trước mỗi pha 4 người đứng đội hình phát cầu đúng luật
 * 1.5 giây rồi chạy 4 giây. Vị trí đi qua detector rồi vào engine như pipeline thật.
 */
interface SimulateOptions {
  skipFormationAt?: number[];
  handSignal?: (index: number) => boolean;
  /** Mô phỏng tracking nhầm ID: từ lần phát này đến hết ván, hai người của đội gần bị báo đổi màu cho nhau. */
  swapNearColorsFrom?: number;
}

function simulate(winners: Team[], options: SimulateOptions = {}) {
  const detector = new ServeFormationDetector();
  const engine = new MatchEngine();
  const score: Score = { near: 0, far: 0 };
  let server: Team = 'near';
  let t = 0;
  // Ai đứng ô phải, ai đứng ô trái của mỗi đội: chỉ đổi khi đội đó thắng pha lúc đang phát.
  const courtPlayers: Record<Team, CourtPlayers> = {
    near: { right: 'blue', left: 'red' },
    far: { right: 'purple', left: 'yellow' },
  };
  const swapped = (p: CourtPlayers): CourtPlayers => ({ right: p.left, left: p.right });

  const play = (durationMs: number, frameAt: (t: number) => ReturnType<typeof moving>) => {
    for (const end = t + durationMs; t < end; t += FRAME_MS) {
      const obs = detector.push({ t, players: frameAt(t) });
      if (obs) engine.observeServe(obs);
    }
  };

  for (const [index, winner] of [undefined, ...winners].entries()) {
    if (winner) {
      if (winner === server) courtPlayers[winner] = swapped(courtPlayers[winner]);
      score[winner] += 1;
      server = winner;
    }
    if (!options.skipFormationAt?.includes(index)) {
      const court = courtForScore(score[server]);
      const withHands = options.handSignal?.(index) ?? true;
      const seen = options.swapNearColorsFrom !== undefined && index >= options.swapNearColorsFrom
        ? { ...courtPlayers, near: swapped(courtPlayers.near) }
        : courtPlayers;
      play(1500, () => formation(server, court, withHands, seen));
    }
    play(4000, moving);
  }
  return { engine, expected: score };
}

describe('mô phỏng cả ván: vị trí → detector → engine', () => {
  it('ván 21-17 với các pha xen kẽ', () => {
    const winners: Team[] = [];
    const pattern: Team[] = ['near', 'near', 'far', 'near', 'far', 'far', 'near'];
    while (winners.filter((w) => w === 'near').length < 20 || winners.filter((w) => w === 'far').length < 17) {
      const next = pattern[winners.length % pattern.length]!;
      const nearCount = winners.filter((w) => w === 'near').length;
      const farCount = winners.filter((w) => w === 'far').length;
      winners.push(next === 'near' ? (nearCount < 20 ? 'near' : 'far') : farCount < 17 ? 'far' : 'near');
    }
    const { engine, expected } = simulate(winners);
    expect(engine.state.score).toEqual(expected);
    expect(engine.state.score).toEqual({ near: 20, far: 17 });

    // Pha cuối không có lần phát tiếp theo: host bấm End, app tự gán cho near.
    expect(engine.finalRallyResolution()).toEqual({ kind: 'auto', team: 'near' });
    engine.end();
    expect(engine.state.score).toEqual({ near: 21, far: 17 });
  });

  it('camera bỏ lỡ một đội hình khi đội nhận cầu thắng liền 2 pha: vẫn ra đúng tỉ số', () => {
    // Pha 2: far thắng (bị bỏ lỡ đội hình), pha 3: far thắng tiếp.
    const { engine, expected } = simulate(['near', 'far', 'far', 'near'], { skipFormationAt: [2] });
    expect(engine.state.score).toEqual(expected);
  });

  it('camera bỏ lỡ một đội hình khi đội phát thắng liền 2 pha: hiện popup, hết giờ thì +2', () => {
    const { engine, expected } = simulate(['near', 'near', 'near'], { skipFormationAt: [2] });
    const pending = engine.state.pendingReplay;
    expect(pending).not.toBeNull();
    engine.decideReplay(pending!.observationId, false);
    expect(engine.state.score).toEqual(expected);
  });
});

/** Sinh ngẫu nhiên có seed để test lặp lại được. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Danh sách đội thắng từng pha cho đến trước pha cuối của ván (không có lần phát nào sau pha cuối). */
function randomGame(seed: number): Team[] {
  const random = seededRandom(seed);
  const score = { near: 0, far: 0 };
  const winners: Team[] = [];
  for (;;) {
    const winner: Team = random() < 0.5 ? 'near' : 'far';
    const next = { ...score, [winner]: score[winner] + 1 };
    const high = Math.max(next.near, next.far);
    if (high >= 30 || (high >= 21 && Math.abs(next.near - next.far) >= 2)) return winners;
    score[winner] += 1;
    winners.push(winner);
  }
}

describe('mô phỏng thiếu tín hiệu tay', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('không có tín hiệu tay nào: vị trí từng người đủ để ra đúng tỉ số (seed %i)', (seed) => {
    const winners = randomGame(seed);
    const { engine, expected } = simulate(winners, { handSignal: () => false });
    const state = engine.state;
    expect(state.pendingReplay).toBeNull();
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual(expected);
  });

  it('tracking nhầm ID từ một lần phát có tổng điểm lẻ: ô giao cầu giữ tỉ số đúng, vị trí mới được lấy làm mốc', () => {
    const winners = randomGame(3);
    // Chọn một lần phát có tổng điểm (trước pha đó) lẻ.
    let total = 0;
    let index = 1;
    for (; index <= winners.length; index += 1) {
      total += 1;
      if (total % 2 === 1) break;
    }
    const { engine, expected } = simulate(winners, { handSignal: () => false, swapNearColorsFrom: index });
    expect(engine.state.score).toEqual(expected);
    expect(engine.state.notes.some((n) => n.kind === 'courtPlayersMismatch')).toBe(true);
  });
});
