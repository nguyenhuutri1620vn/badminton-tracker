import { COURT, teamOfPosition } from '../core/court';
import type { PlayerSample } from '../core/serveFormation';
import type { Team } from '../core/types';
import type { PlayerColor } from '../data/types';

/** Một người đã quy về mét trên sân. */
export interface CourtDetection {
  x: number;
  y: number;
  handRaised: boolean | null;
  confidence: number;
}

export interface TrackerOptions {
  /** Người bị che bao lâu thì vẫn giữ vị trí cũ. */
  holdMs: number;
  /** Tốc độ chạy tối đa (m/s) dùng để loại ghép cặp vô lý. */
  maxSpeed: number;
  /** Vùng nhận người: sân đánh đôi cộng thêm biên này (mét); phía sau biên cuối rộng gấp đôi. */
  margin: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = { holdMs: 1500, maxSpeed: 8, margin: 1 };

/** Màu của mỗi đội: màu đầu là người bên trái camera lúc bắt đầu. */
const TEAM_COLORS: Record<Team, [PlayerColor, PlayerColor]> = {
  near: ['blue', 'red'],
  far: ['purple', 'yellow'],
};

interface Track {
  color: PlayerColor;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastSeen: number;
  handRaised: boolean | null;
}

/**
 * Gán 4 chấm màu cho 4 người trên sân và giữ màu qua các khung hình.
 * Không đổi sân nên mỗi đội luôn ở một nửa sân: chỉ cần ghép người trong cùng nửa sân,
 * nhầm màu (nếu có) chỉ xảy ra giữa hai người cùng đội và host đổi lại bằng một nút.
 */
export class CourtTracker {
  private tracks: Record<Team, Track[]> = { near: [], far: [] };

  constructor(private readonly options: TrackerOptions = DEFAULT_TRACKER_OPTIONS) {}

  reset(): void {
    this.tracks = { near: [], far: [] };
  }

  /** Host thấy hai người cùng đội bị gán ngược màu thì đổi lại. */
  swap(team: Team): void {
    const [a, b] = this.tracks[team];
    if (a && b) [a.color, b.color] = [b.color, a.color];
  }

  inCourtArea(d: { x: number; y: number }): boolean {
    const m = this.options.margin;
    return d.x >= -m && d.x <= COURT.width + m && d.y >= -2 * m && d.y <= COURT.length + 2 * m;
  }

  update(t: number, detections: CourtDetection[]): PlayerSample[] {
    for (const team of ['near', 'far'] as const) {
      const candidates = detections.filter((d) => this.inCourtArea(d) && teamOfPosition(d.y) === team);
      this.updateTeam(team, t, candidates);
    }
    return (['near', 'far'] as const).flatMap((team) =>
      this.tracks[team]
        .filter((tr) => t - tr.lastSeen <= this.options.holdMs)
        .map((tr) => ({
          id: tr.color,
          x: tr.x,
          y: tr.y,
          ...(tr.handRaised === null ? {} : { handRaised: tr.handRaised }),
        })),
    );
  }

  private updateTeam(team: Team, t: number, candidates: CourtDetection[]): void {
    const tracks = this.tracks[team];
    if (tracks.length < 2) {
      // Khởi tạo khi thấy đủ 2 người trong nửa sân: người bên trái camera nhận màu đầu.
      if (candidates.length < 2) return;
      const pair = [...candidates].sort((a, b) => b.confidence - a.confidence).slice(0, 2).sort((a, b) => a.x - b.x);
      this.tracks[team] = pair.map((d, i) => ({
        color: TEAM_COLORS[team][i]!,
        x: d.x,
        y: d.y,
        vx: 0,
        vy: 0,
        lastSeen: t,
        handRaised: d.handRaised,
      }));
      return;
    }

    const assignment = this.bestAssignment(tracks, candidates, t);
    for (const [trackIndex, detection] of assignment) {
      const track = tracks[trackIndex]!;
      const dt = Math.max((t - track.lastSeen) / 1000, 1e-3);
      // Làm mượt vận tốc để dự đoán vị trí khi người bị che ngắn.
      track.vx = 0.6 * track.vx + 0.4 * ((detection.x - track.x) / dt);
      track.vy = 0.6 * track.vy + 0.4 * ((detection.y - track.y) / dt);
      track.x = detection.x;
      track.y = detection.y;
      track.lastSeen = t;
      track.handRaised = detection.handRaised;
    }
  }

  /** Ghép người với track sao cho tổng khoảng cách tới vị trí dự đoán nhỏ nhất, bỏ ghép xa vô lý. */
  private bestAssignment(tracks: Track[], candidates: CourtDetection[], t: number): [number, CourtDetection][] {
    const predicted = tracks.map((tr) => {
      const dt = Math.min((t - tr.lastSeen) / 1000, 0.5);
      return { x: tr.x + tr.vx * dt, y: tr.y + tr.vy * dt, gate: this.options.maxSpeed * Math.max((t - tr.lastSeen) / 1000, 0.1) + 1 };
    });
    let best: [number, CourtDetection][] = [];
    let bestScore = -Infinity;
    const options: (CourtDetection | null)[] = [null, ...candidates];
    for (const a of options) {
      for (const b of options) {
        if (a && a === b) continue;
        const pairs: [number, CourtDetection][] = [];
        let cost = 0;
        let valid = true;
        for (const [i, d] of [a, b].entries()) {
          if (!d) continue;
          const p = predicted[i]!;
          const dist = Math.hypot(d.x - p.x, d.y - p.y);
          if (dist > p.gate) valid = false;
          cost += dist;
          pairs.push([i, d]);
        }
        if (!valid) continue;
        // Ưu tiên ghép được nhiều người, sau đó tổng khoảng cách nhỏ.
        const score = pairs.length * 100 - cost;
        if (score > bestScore) {
          bestScore = score;
          best = pairs;
        }
      }
    }
    return best;
  }
}
