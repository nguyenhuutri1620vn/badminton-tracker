import type { PositionFrame } from './serveFormation';
import { teamOfPosition } from './court';
import type { Team } from './types';

export interface ServeTeamConfig {
  /** Quãng dịch chuyển đo qua khoảng này. */
  moveWindowMs: number;
  /** Đi quá chừng này (cộng nhiễu movePx pixel) trong cửa sổ đo là đã rời chỗ. */
  moveM: number;
  movePx: number;
  /** Hai đội rời chỗ cách nhau dưới khoảng này thì không biết đội nào trước. */
  minGapMs: number;
  /** Chỉ tìm lần phát trong khoảng này sau lần dừng (và trước lần dừng kế tiếp). */
  searchMs: number;
}

export const DEFAULT_SERVE_TEAM_CONFIG: ServeTeamConfig = {
  moveWindowMs: 500,
  moveM: 0.5,
  movePx: 3,
  minGapMs: 300,
  searchMs: 8000,
};

export interface ServeTeamGuess {
  /** Lúc có người đầu tiên rời chỗ sau lần dừng, tức ngay sau cú phát (ms). */
  t: number;
  /** null khi hai đội rời chỗ gần như cùng lúc. */
  team: Team | null;
}

/**
 * Đoán đội phát của mỗi pha từ chuyển động, không cần đội hình phát cầu đúng chuẩn: sau cú phát, đội nhận phải
 * di chuyển để đỡ cầu, còn người phát chỉ vung vợt tại chỗ. Vì vậy đội rời chỗ sau là đội phát.
 * pauseTimes là các lần cả sân dừng lại chuẩn bị phát (RallyCounter).
 * Chưa kiểm chứng trên nhãn thật: dùng để đo bằng công cụ gán nhãn trước khi đưa vào engine.
 */
export function guessServingTeams(
  frames: readonly PositionFrame[],
  pauseTimes: readonly number[],
  config: ServeTeamConfig = DEFAULT_SERVE_TEAM_CONFIG,
): ServeTeamGuess[] {
  const guesses: ServeTeamGuess[] = [];
  pauseTimes.forEach((pause, k) => {
    const until = Math.min(pause + config.searchMs, pauseTimes[k + 1] ?? Infinity);
    const firstMove: Record<Team, number> = { near: Infinity, far: Infinity };
    let back = 0;
    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i]!;
      if (frame.t <= pause) continue;
      if (frame.t > until) break;
      // Khung cách khung này ít nhất một cửa sổ đo.
      while (back + 1 < i && frames[back + 1]!.t <= frame.t - config.moveWindowMs) back += 1;
      const before = frames[back]!;
      if (before.t < pause || frame.t - before.t < config.moveWindowMs) continue;
      for (const p of frame.players) {
        const start = before.players.find((q) => q.id === p.id);
        if (!start) continue;
        const moved = Math.hypot(p.x - start.x, p.y - start.y) - config.movePx * (p.metersPerPixel ?? 0);
        const team = teamOfPosition(p.y);
        if (moved > config.moveM && frame.t < firstMove[team]) firstMove[team] = frame.t;
      }
      if (Number.isFinite(firstMove.near) && Number.isFinite(firstMove.far)) break;
    }
    const t = Math.min(firstMove.near, firstMove.far);
    if (!Number.isFinite(t)) return;
    const gap = firstMove.near - firstMove.far;
    const team: Team | null = Math.abs(gap) < config.minGapMs ? null : gap > 0 ? 'near' : 'far';
    guesses.push({ t, team });
  });
  return guesses;
}
