import { courtForScore, isGameOver } from '../core/rules';
import type { PlayerSample, PositionFrame } from '../core/serveFormation';
import { formation } from '../core/testing/positions';
import type { CourtPlayers, Score, Team } from '../core/types';
import type { FrameSource } from './frameSource';

export interface SimulatorOptions {
  random?: () => number;
  /** Thời gian đứng đội hình phát cầu. */
  formationMs?: number;
  /** Thời gian một pha đánh. */
  rallyMs?: number;
  /** Tỉ lệ lần phát có tín hiệu tay rõ ràng. */
  handSignalRate?: number;
  /** Tỉ lệ đội hình phát cầu bị "che" (người chơi vẫn chạy, không đứng yên). */
  missRate?: number;
}

/** Sau khi ván kết thúc, người chơi ra lưới bắt tay (ngoài ô giao cầu). */
const IDLE_POSITIONS: PlayerSample[] = [
  { id: 'blue', x: 2.5, y: 6.1 },
  { id: 'red', x: 3.6, y: 6.1 },
  { id: 'purple', x: 2.5, y: 7.3 },
  { id: 'yellow', x: 3.6, y: 7.3 },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Giả lập một ván đôi theo đúng luật: trước mỗi pha 4 người đứng đội hình phát cầu, rồi chạy trong pha đánh
 * và di chuyển liên tục (không dịch chuyển tức thời) tới vị trí của lần phát kế tiếp.
 * Dùng để chạy thử toàn bộ app khi chưa có camera. Ván dừng ở pha cuối (không có lần phát nào sau đó).
 */
export class MatchSimulator {
  readonly score: Score = { near: 0, far: 0 };
  server: Team = 'near';
  winners: Team[] = [];
  private courtPlayers: Record<Team, CourtPlayers> = {
    near: { right: 'blue', left: 'red' },
    far: { right: 'purple', left: 'yellow' },
  };
  private t = 0;
  private phase: 'formation' | 'rally' | 'done' = 'formation';
  private phaseStartedAt = 0;
  private phaseEndsAt: number;
  private withHands = true;
  private hidden = false;
  private current: PlayerSample[];
  private from: PlayerSample[] = [];
  private to: PlayerSample[] = [];
  private wander = new Map<string, [number, number]>();
  private readonly random: () => number;
  private readonly formationMs: number;
  private readonly rallyMs: number;
  private readonly handSignalRate: number;
  private readonly missRate: number;

  constructor(options: SimulatorOptions = {}) {
    this.random = options.random ?? Math.random;
    this.formationMs = options.formationMs ?? 1500;
    this.rallyMs = options.rallyMs ?? 4000;
    this.handSignalRate = options.handSignalRate ?? 0.5;
    this.missRate = options.missRate ?? 0;
    this.phaseEndsAt = this.formationMs;
    this.rollFormation();
    this.current = this.formationPositions();
  }

  get finished(): boolean {
    return this.phase === 'done';
  }

  /** Tiến thời gian dtMs và trả về khung hình tại thời điểm mới. */
  next(dtMs: number): PositionFrame {
    this.t += dtMs;
    while (this.phase !== 'done' && this.t >= this.phaseEndsAt) this.advancePhase();
    return { t: this.t, players: this.playersNow() };
  }

  private formationPositions(): PlayerSample[] {
    const court = courtForScore(this.score[this.server]);
    return formation(this.server, court, this.withHands, this.courtPlayers);
  }

  private playersNow(): PlayerSample[] {
    if (this.phase === 'formation' && !this.hidden) return this.current;
    if (this.phase === 'done') return IDLE_POSITIONS;
    // Đang chạy (hoặc đội hình bị che: người chơi không đứng yên): đi từ vị trí cũ tới vị trí mới, lượn ra giữa đường.
    const progress = clamp((this.t - this.phaseStartedAt) / (this.phaseEndsAt - this.phaseStartedAt), 0, 1);
    // Hai nhịp lượn chồng nhau để không có lúc nào người chơi đứng yên lâu giữa pha đánh.
    const swing = Math.sin(Math.PI * progress);
    const swing2 = Math.sin(3 * Math.PI * progress);
    return this.from.map((a) => {
      const b = this.to.find((p) => p.id === a.id) ?? a;
      const [wx, wy] = this.wander.get(a.id) ?? [0, 0];
      const near = a.y < 6.7;
      return {
        id: a.id,
        x: clamp(a.x + (b.x - a.x) * progress + wx * swing + 0.6 * swing2, 0.2, 5.9),
        y: clamp(a.y + (b.y - a.y) * progress + wy * swing - 0.5 * wy * swing2, near ? 0.3 : 7.2, near ? 6.2 : 13.1),
      };
    });
  }

  private rollWander(): void {
    this.wander.clear();
    for (const [i, id] of ['blue', 'red', 'purple', 'yellow'].entries()) {
      // Một người lên lưới, một người lùi sau để hai người cùng đội không trùng đường.
      const depth = i % 2 === 0 ? 1 : -1;
      this.wander.set(id, [(this.random() - 0.5) * 2, depth * (0.8 + this.random())]);
    }
  }

  private advancePhase(): void {
    this.phaseStartedAt = this.phaseEndsAt;
    if (this.phase === 'formation') {
      // Bắt đầu pha đánh: quyết định luôn đội thắng để biết người chơi sẽ chạy về đâu.
      this.from = this.current;
      this.decideRally();
      this.rollWander();
      this.phase = 'rally';
      this.phaseEndsAt += this.rallyMs;
      return;
    }
    if (this.to === IDLE_POSITIONS) {
      this.phase = 'done';
      return;
    }
    this.current = this.to;
    this.rollFormation();
    this.phase = 'formation';
    this.phaseEndsAt += this.formationMs;
    if (this.hidden) {
      // Đội hình bị che: người chơi vẫn lắc lư quanh vị trí, không đứng yên đủ lâu.
      this.from = this.current;
      this.to = this.current;
      this.rollWander();
    }
  }

  private decideRally(): void {
    const winner: Team = this.random() < 0.5 ? 'near' : 'far';
    this.winners.push(winner);
    if (isGameOver({ ...this.score, [winner]: this.score[winner] + 1 })) {
      // Pha cuối: không còn lần phát nào nữa.
      this.score[winner] += 1;
      this.to = IDLE_POSITIONS;
      return;
    }
    if (winner === this.server) {
      const players = this.courtPlayers[winner];
      this.courtPlayers[winner] = { right: players.left, left: players.right };
    }
    this.score[winner] += 1;
    this.server = winner;
    this.withHands = this.random() < this.handSignalRate;
    this.to = this.formationPositions();
  }

  private rollFormation(): void {
    this.withHands = this.random() < this.handSignalRate;
    this.hidden = this.random() < this.missRate;
  }
}

/** Phát khung hình giả lập theo thời gian thực (có thể tua nhanh). */
export class SimulatedFrameSource implements FrameSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly simulator: MatchSimulator;

  constructor(
    options: SimulatorOptions = {},
    private readonly speed = 1,
    private readonly fps = 15,
  ) {
    this.simulator = new MatchSimulator(options);
  }

  start(onFrame: (frame: PositionFrame) => void): void {
    const interval = 1000 / this.fps;
    // Tua nhanh bằng cách phát nhiều khung hình mỗi nhịp, để detector vẫn thấy đủ 15 khung/giây của thời gian giả lập.
    this.timer = setInterval(() => {
      for (let i = 0; i < this.speed; i += 1) onFrame(this.simulator.next(interval));
    }, interval);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
