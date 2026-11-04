import { distanceToNet, isInServiceBox, serviceCourtSide, teamOfPosition } from './court';
import type { CourtPlayers, ServeObservation, ServiceCourt, Team } from './types';

/** Vị trí một người chơi trong một khung hình, đã quy về mét trên sân. */
export interface PlayerSample {
  /** Màu chấm trên mini map (blue, red, purple, yellow) hoặc id tracking. */
  id: string;
  x: number;
  y: number;
  /** Tay cầm vợt giơ cao hơn vai (từ pose). Người nhận cầu thường giơ vợt, người phát thì không. */
  handRaised?: boolean;
}

export interface PositionFrame {
  t: number;
  players: PlayerSample[];
}

export interface DetectorConfig {
  /** Thời gian cả 4 người phải đứng yên. */
  stillDurationMs: number;
  /** Mỗi người không được lệch quá khoảng này khỏi vị trí trung bình trong cửa sổ đứng yên. */
  stillToleranceM: number;
  /** Sau khi phát ra quan sát, cần có người di chuyển quá khoảng này mới nhận đội hình tiếp theo. */
  rearmDistanceM: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  stillDurationMs: 1000,
  stillToleranceM: 0.25,
  rearmDistanceM: 1.0,
};

/** Độ tin cậy của một đội hình phát cầu đã qua đủ các kiểm tra hình học. */
const FORMATION_CONFIDENCE = 0.9;

interface Mean {
  x: number;
  y: number;
}

/**
 * Nhận chuỗi khung hình vị trí, phát ra một ServeObservation mỗi khi thấy đội hình phát cầu đúng luật:
 * 4 người đứng yên khoảng 1 giây, mỗi bên 2 người, người đứng trước của hai đội ở hai ô giao cầu chéo nhau.
 */
export class ServeFormationDetector {
  private window: PositionFrame[] = [];
  private emittedAt: Map<string, Mean> | null = null;
  private nextId = 1;

  constructor(private readonly config: DetectorConfig = DEFAULT_DETECTOR_CONFIG) {}

  push(frame: PositionFrame): ServeObservation | null {
    this.window.push(frame);
    const cutoff = frame.t - this.config.stillDurationMs;
    while (this.window.length > 1 && this.window[1]!.t <= cutoff) this.window.shift();

    if (this.emittedAt) {
      if (!this.hasMovedSinceEmit(frame)) return null;
      this.emittedAt = null;
    }

    const first = this.window[0];
    if (!first || frame.t - first.t < this.config.stillDurationMs) return null;

    const means = this.stationaryMeans();
    if (!means) return null;

    const observation = this.recognize(frame, means);
    if (observation) this.emittedAt = means;
    return observation;
  }

  private hasMovedSinceEmit(frame: PositionFrame): boolean {
    return frame.players.some((p) => {
      const anchor = this.emittedAt?.get(p.id);
      return !anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > this.config.rearmDistanceM;
    });
  }

  /** Vị trí trung bình của mỗi người nếu cả 4 người đều đứng yên trong cửa sổ, ngược lại null. */
  private stationaryMeans(): Map<string, Mean> | null {
    const tracks = new Map<string, Mean[]>();
    for (const frame of this.window) {
      for (const p of frame.players) {
        const list = tracks.get(p.id) ?? [];
        list.push({ x: p.x, y: p.y });
        tracks.set(p.id, list);
      }
    }
    if (tracks.size !== 4) return null;

    const means = new Map<string, Mean>();
    for (const [id, points] of tracks) {
      if (points.length < this.window.length) return null;
      const mean = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length,
      };
      const still = points.every((p) => Math.hypot(p.x - mean.x, p.y - mean.y) <= this.config.stillToleranceM);
      if (!still) return null;
      means.set(id, mean);
    }
    return means;
  }

  private recognize(frame: PositionFrame, means: Map<string, Mean>): ServeObservation | null {
    const front = new Map<Team, { id: string; partnerId: string; mean: Mean; court: ServiceCourt }>();
    for (const team of ['near', 'far'] as const) {
      const members = [...means].filter(([, m]) => teamOfPosition(m.y) === team);
      if (members.length !== 2) return null;
      // Người đứng gần lưới hơn là người phát hoặc người nhận.
      const [id, mean] = members.reduce((a, b) => (distanceToNet(a[1].y) < distanceToNet(b[1].y) ? a : b));
      if (!isInServiceBox(team, mean.x, mean.y)) return null;
      const partnerId = members.find(([memberId]) => memberId !== id)![0];
      front.set(team, { id, partnerId, mean, court: serviceCourtSide(team, mean.x) });
    }

    const near = front.get('near')!;
    const far = front.get('far')!;
    // Phát cầu chéo: ô của hai người tính theo góc nhìn riêng phải trùng nhau (phải-phải hoặc trái-trái).
    if (near.court !== far.court) return null;

    const latest = new Map(frame.players.map((p) => [p.id, p]));
    const nearRaised = latest.get(near.id)?.handRaised;
    const farRaised = latest.get(far.id)?.handRaised;

    // Chỉ khi đúng một người giơ vợt mới biết ai nhận cầu; còn lại để engine tự suy ra từ ô giao cầu.
    const hasHandSignal = nearRaised !== undefined && farRaised !== undefined && nearRaised !== farRaised;
    const servingTeam: Team | null = hasHandSignal ? (nearRaised ? 'far' : 'near') : null;

    // Người đứng trước ở ô của lần phát này; đồng đội của họ thuộc ô còn lại.
    const courtPlayersOf = (f: { id: string; partnerId: string; court: ServiceCourt }): CourtPlayers =>
      f.court === 'right' ? { right: f.id, left: f.partnerId } : { right: f.partnerId, left: f.id };

    const id = `s${this.nextId}`;
    this.nextId += 1;
    return {
      type: 'serve',
      id,
      t: frame.t,
      servingTeam,
      court: near.court,
      courtPlayers: { near: courtPlayersOf(near), far: courtPlayersOf(far) },
      confidence: FORMATION_CONFIDENCE,
    };
  }
}
