import { describe, expect, it } from 'vitest';
import { RallyCounter } from './rallyCounter';
import { courtForScore, isGameOver } from './rules';
import { MatchEngine } from './scoreEngine';
import { ServeFormationDetector, type PlayerSample } from './serveFormation';
import { formation, moving } from './testing/positions';
import type { CourtPlayers, Score, Team } from './types';

const FRAME_MS = 1000 / 12;

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Người chơi đi bộ chậm (nhặt cầu, về vị trí): khoảng 0,5 m/s, không phải đứng yên. */
function walking(t: number): PlayerSample[] {
  const d = ((t % 4000) / 4000) * 2;
  return [
    { id: 'blue', x: 1.5 + d, y: 3 },
    { id: 'red', x: 4.5 - d, y: 2 },
    { id: 'purple', x: 1.5 + d, y: 10 },
    { id: 'yellow', x: 4.5 - d, y: 11 },
  ];
}

describe('RallyCounter', () => {
  const run = (segments: [number, (t: number) => PlayerSample[]][]) => {
    const counter = new RallyCounter();
    let t = 0;
    for (const [duration, at] of segments) {
      for (const end = t + duration; t < end; t += FRAME_MS) counter.push({ t, players: at(t) });
    }
    return counter;
  };
  const still = (court: 'right' | 'left') => () => formation('near', court);

  it('mỗi lần dừng sau khi đánh là một lần chuẩn bị phát', () => {
    const counter = run([
      [2000, still('right')],
      [5000, moving],
      [2000, still('left')],
      [5000, moving],
      [2000, still('right')],
    ]);
    expect(counter.pauseTimes).toHaveLength(3);
  });

  it('đứng chờ lâu chỉ tính một lần; đi bộ chậm giữa hai pha không tính là dừng', () => {
    const counter = run([
      [10_000, still('right')],
      [5000, moving],
      [4000, walking],
      [2000, still('left')],
    ]);
    expect(counter.pauseTimes).toHaveLength(2);
  });

  it('thiếu một người (bị che) vẫn đếm được', () => {
    const three = () => formation('near', 'right').slice(1);
    const counter = run([
      [5000, moving],
      [2000, three],
    ]);
    expect(counter.pauseTimes).toHaveLength(1);
  });
});

/**
 * Chơi một ván ngẫu nhiên: trước mỗi pha 4 người dừng lại đúng đội hình 1,5 giây rồi đánh 5 giây.
 * Với xác suất missRate, một người bị che suốt lúc đứng đội hình: bộ phát hiện đội hình bỏ lỡ lần phát đó,
 * nhưng người chơi vẫn dừng lại nên bộ đếm pha vẫn thấy.
 */
function playGame(seed: number, missRate: number, useRallyCounts: boolean): boolean {
  const random = seededRandom(seed);
  const detector = new ServeFormationDetector();
  const engine = new MatchEngine();
  const score: Score = { near: 0, far: 0 };
  let server: Team = 'near';
  let t = 0;
  const courtPlayers: Record<Team, CourtPlayers> = {
    near: { right: 'blue', left: 'red' },
    far: { right: 'purple', left: 'yellow' },
  };
  const play = (durationMs: number, at: (t: number) => PlayerSample[]) => {
    for (const end = t + durationMs; t < end; t += FRAME_MS) {
      const obs = detector.push({ t, players: at(t) });
      if (!obs) continue;
      engine.observeServe(useRallyCounts ? obs : { ...obs, ralliesSincePrevious: null });
      const pending = engine.state.pendingReplay;
      if (pending) engine.decideReplay(pending.observationId, false);
    }
  };

  let first = true;
  while (!isGameOver(score)) {
    if (!first) {
      const winner: Team = random() < 0.5 ? 'near' : 'far';
      if (winner === server) {
        const p = courtPlayers[winner];
        courtPlayers[winner] = { right: p.left, left: p.right };
      }
      score[winner] += 1;
      server = winner;
      if (isGameOver(score)) break;
    }
    // Lần phát đầu tiên luôn thấy được, để ván có mốc đội phát.
    const hidden = !first && random() < missRate;
    first = false;
    const players = formation(server, courtForScore(score[server]), false, { ...courtPlayers });
    play(1500, () => (hidden ? players.slice(1) : players));
    play(5000, moving);
  }
  const resolution = engine.finalRallyResolution();
  const final = { ...engine.state.score };
  if (resolution.kind === 'auto') final[resolution.team] += 1;
  return final.near === score.near && final.far === score.far;
}

describe('đếm pha giúp engine chịu được bỏ lỡ nhiều lần phát', () => {
  const GAMES = 40;
  const rate = (missRate: number, useRallyCounts: boolean) =>
    Array.from({ length: GAMES }, (_, i) => playGame(1000 + i, missRate, useRallyCounts)).filter(Boolean).length / GAMES;

  it('không bỏ lỡ: đúng mọi ván dù có hay không dùng số pha', () => {
    expect(rate(0, true)).toBe(1);
  }, 30_000);

  it.each([0.1, 0.2, 0.3])('bỏ lỡ %s lần phát: dùng số pha đúng nhiều ván hơn hẳn', (missRate) => {
    const without = rate(missRate, false);
    const withCounts = rate(missRate, true);
    console.log(`bỏ lỡ ${missRate * 100}%: không đếm pha ${Math.round(without * 100)}%, có đếm pha ${Math.round(withCounts * 100)}%`);
    expect(withCounts).toBeGreaterThan(without + 0.15);
  }, 30_000);
});
