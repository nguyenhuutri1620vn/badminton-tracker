import type { PositionFrame } from './serveFormation';

export interface RallyCounterConfig {
  /** Tốc độ tính bằng quãng dịch chuyển qua khoảng này, để nhiễu vị trí từng khung không thành tốc độ giả. */
  speedWindowMs: number;
  /** Tốc độ (trung vị của những người thấy được, m/s) dưới mức này là đang đứng. */
  stillSpeed: number;
  /** Phải đứng chừng này mới tính là dừng lại chuẩn bị phát. */
  minStillMs: number;
  /** Tốc độ vượt mức này là đã di chuyển (đánh, đi nhặt cầu): lần dừng sau đó mới là lần chuẩn bị phát mới. */
  movingSpeed: number;
}

/**
 * Đo trên video phong trào: lúc đánh tốc độ trung vị chỉ 0,5–1,3 m/s, gần bằng lúc đi bộ giữa hai pha, nên không
 * tách pha theo tốc độ được. Nhưng trước mỗi lần phát cả 4 người đều khựng lại (trung vị dưới 0,3 m/s).
 * Cửa sổ đo cộng thời gian đứng tối thiểu (1,1 giây) phải ngắn hơn lúc đứng chuẩn bị phát (1–2 giây),
 * nếu không lần dừng bị bỏ qua.
 */
export const DEFAULT_RALLY_CONFIG: RallyCounterConfig = {
  speedWindowMs: 600,
  stillSpeed: 0.3,
  minStillMs: 500,
  movingSpeed: 0.7,
};

interface Sample {
  t: number;
  positions: Map<string, [number, number]>;
}

/**
 * Đếm số lần cả sân dừng lại chuẩn bị phát cầu, mỗi lần là một pha mới, mà không cần thấy rõ đội hình phát cầu
 * (người đứng lệch ô, tracking nhầm màu vẫn đếm được). Engine dùng số này để biết giữa hai lần phát nhìn thấy
 * có bao nhiêu pha, thay vì phải đoán.
 */
export class RallyCounter {
  private samples: Sample[] = [];
  private stillSince: number | null = null;
  /** Đã di chuyển kể từ lần dừng trước: đứng chờ lâu không bị đếm thành nhiều lần. */
  private movedSinceLastPause = true;
  private pauses: number[] = [];

  constructor(private readonly config: RallyCounterConfig = DEFAULT_RALLY_CONFIG) {}

  /** Thời điểm các lần dừng chuẩn bị phát đã thấy. */
  get pauseTimes(): readonly number[] {
    return this.pauses;
  }

  /** Số lần dừng trong khoảng (from, to]. */
  countBetween(from: number, to: number): number {
    return this.pauses.filter((t) => t > from && t <= to).length;
  }

  push(frame: PositionFrame): void {
    this.samples.push({ t: frame.t, positions: new Map(frame.players.map((p) => [p.id, [p.x, p.y]])) });
    const cutoff = frame.t - this.config.speedWindowMs;
    while (this.samples.length > 1 && this.samples[1]!.t <= cutoff) this.samples.shift();

    const speed = this.speed();
    if (speed === null) return;
    if (speed > this.config.movingSpeed) this.movedSinceLastPause = true;
    if (speed >= this.config.stillSpeed) {
      this.stillSince = null;
      return;
    }
    this.stillSince ??= frame.t;
    if (this.movedSinceLastPause && frame.t - this.stillSince >= this.config.minStillMs) {
      this.pauses.push(this.stillSince);
      this.movedSinceLastPause = false;
    }
  }

  /** Trung vị tốc độ (m/s) của những người có mặt ở cả đầu và cuối cửa sổ; null khi chưa đủ dữ liệu. */
  private speed(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t < this.config.speedWindowMs * 0.8) return null;
    const seconds = (last.t - first.t) / 1000;
    const speeds: number[] = [];
    for (const [id, [x, y]] of last.positions) {
      const start = first.positions.get(id);
      if (start) speeds.push(Math.hypot(x - start[0], y - start[1]) / seconds);
    }
    // Cần thấy ít nhất 3 người: thiếu người thì trung vị không đại diện được cả sân.
    if (speeds.length < 3) return null;
    speeds.sort((a, b) => a - b);
    return speeds[Math.floor(speeds.length / 2)]!;
  }
}
