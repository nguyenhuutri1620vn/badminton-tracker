import { distanceToNet, isInServiceBox, serviceCourtSide, teamOfPosition } from './court';
import { RallyCounter } from './rallyCounter';
import type { CourtPlayers, ServeObservation, ServiceCourt, Team } from './types';

/** Vị trí một người chơi trong một khung hình, đã quy về mét trên sân. */
export interface PlayerSample {
  /** Màu chấm trên mini map (blue, red, purple, yellow) hoặc id tracking. */
  id: string;
  x: number;
  y: number;
  /** Tay cầm vợt giơ cao hơn vai (từ pose). Người nhận cầu thường giơ vợt, người phát thì không. */
  handRaised?: boolean;
  /**
   * Số mét ứng với 1 pixel ảnh tại chỗ người đứng (theo chiều kém nhất). Ở nửa xa của camera góc rộng là 0,06–0,13 m,
   * nên vị trí rung vài pixel đã thành vài chục cm dù người đứng yên. Không có thì coi như đo chính xác.
   */
  metersPerPixel?: number;
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
  /** Ở xa camera, ngưỡng trên được nới thành chừng này pixel (theo `metersPerPixel`) nếu lớn hơn. */
  stillTolerancePx: number;
  /** Sau khi phát ra quan sát, cần có người di chuyển quá khoảng này mới nhận đội hình tiếp theo. */
  rearmDistanceM: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  stillDurationMs: 1000,
  stillToleranceM: 0.25,
  // Đo trên video phong trào 720p (DECISIONS D59): 3 pixel tăng số lần phát nhận ra gần gấp đôi; 4–5 pixel bắt đầu
  // nhận đội hình giả cách nhau vài giây khi người ở xa còn đang bước vào chỗ.
  stillTolerancePx: 3,
  rearmDistanceM: 1.0,
};

/** Độ tin cậy của một đội hình phát cầu đã qua đủ các kiểm tra hình học. */
const FORMATION_CONFIDENCE = 0.9;

/**
 * Lần dừng của chính lần phát này (hoặc lần phát trước) có thể được ghi nhận lệch vài giây so với lúc nhận ra
 * đội hình, vì tốc độ đo qua cửa sổ 1 giây. Chỉ đếm lần dừng nằm hẳn giữa hai lần phát, cách mỗi đầu khoảng này.
 */
const PAUSE_GUARD_MS = 3000;

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
  private readonly rallies = new RallyCounter();
  private previousServeT: number | null = null;

  constructor(private readonly config: DetectorConfig = DEFAULT_DETECTOR_CONFIG) {}

  /** Thời điểm các lần cả sân dừng lại chuẩn bị phát (kể cả những lần không nhận ra đội hình). */
  get pauseTimes(): readonly number[] {
    return this.rallies.pauseTimes;
  }

  push(frame: PositionFrame): ServeObservation | null {
    this.rallies.push(frame);
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
    if (!observation) return null;
    this.emittedAt = means;
    // Mỗi lần dừng nằm giữa hai lần phát nhìn thấy là một lần phát bị bỏ lỡ, tức thêm một pha.
    observation.ralliesSincePrevious =
      this.previousServeT === null
        ? null
        : 1 + this.rallies.countBetween(this.previousServeT + PAUSE_GUARD_MS, frame.t - PAUSE_GUARD_MS);
    this.previousServeT = frame.t;
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
    const tracks = new Map<string, PlayerSample[]>();
    for (const frame of this.window) {
      for (const p of frame.players) {
        const list = tracks.get(p.id) ?? [];
        list.push(p);
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
      const metersPerPixel = points[points.length - 1]!.metersPerPixel ?? 0;
      const tolerance = Math.max(this.config.stillToleranceM, this.config.stillTolerancePx * metersPerPixel);
      const still = points.every((p) => Math.hypot(p.x - mean.x, p.y - mean.y) <= tolerance);
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
