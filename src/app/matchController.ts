import { MatchEngine, DEFAULT_CONFIG, type EngineConfig } from '../core/scoreEngine';
import type { FinalRallyResolution, MatchState, Score, ServeObservation, Team } from '../core/types';
import type { Lineup, MatchRecord, PositionSample, Session } from '../data/types';
import { SessionError, validateLineup } from './session';

/** Thời gian chờ host trả lời popup "Phát lại?". */
export const REPLAY_TIMEOUT_MS = 5000;

/** Gom vị trí rồi ghi một lần để không ghi IndexedDB 10 lần mỗi giây. */
const POSITION_FLUSH_SIZE = 200;

export interface MatchStore {
  saveMatch(match: MatchRecord): Promise<void>;
  appendPositions(matchId: string, samples: PositionSample[]): Promise<void>;
}

/** Ghi video của ván; trả về tên file đã lưu (null nếu không lưu được). */
export interface MatchRecorder {
  start(fileBaseName: string): Promise<void>;
  stop(): Promise<string | null>;
}

export interface ControllerDeps {
  store: MatchStore;
  recorder: MatchRecorder | null;
  now?: () => number;
  newId?: () => string;
  engineConfig?: EngineConfig;
}

export interface ReplayPrompt {
  observationId: string;
  deadline: number;
}

export interface ControllerSnapshot {
  match: MatchRecord | null;
  state: MatchState | null;
  replayPrompt: ReplayPrompt | null;
  /** Host bấm End nhưng app không tự xác định được pha cuối. */
  endQuestion: FinalRallyResolution | null;
  /** Cảnh báo không chặn việc chấm điểm (ví dụ không ghi được video). */
  warnings: string[];
}

export interface StartOptions {
  session: Session;
  lineup: Lineup;
  index: number;
  calibrationId: string | null;
}

type Listener = (snapshot: ControllerSnapshot) => void;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Tên file video: van-03_2026-11-03_19-05. */
export function videoBaseName(index: number, startedAt: number): string {
  const d = new Date(startedAt);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `van-${pad(index)}_${date}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/**
 * Điều phối vòng đời một ván: Start → nhận quan sát phát cầu → popup phát lại → End.
 * Mọi thay đổi của engine được lưu ngay để mở lại app giữa ván không mất gì.
 */
export class MatchController {
  private match: MatchRecord | null = null;
  private engine: MatchEngine | null = null;
  private replayPrompt: ReplayPrompt | null = null;
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private endQuestion: FinalRallyResolution | null = null;
  private warnings: string[] = [];
  private positions: PositionSample[] = [];
  private listeners = new Set<Listener>();
  private saving: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly engineConfig: EngineConfig;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.engineConfig = deps.engineConfig ?? DEFAULT_CONFIG;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): ControllerSnapshot {
    return {
      match: this.match,
      state: this.engine?.state ?? null,
      replayPrompt: this.replayPrompt,
      endQuestion: this.endQuestion,
      warnings: [...this.warnings],
    };
  }

  get isActive(): boolean {
    return this.match !== null;
  }

  /** Thời gian (ms) kể từ khi bắt đầu ván, dùng làm mốc t cho quan sát và vị trí. */
  elapsed(): number {
    return this.match ? this.now() - this.match.startedAt : 0;
  }

  async start(options: StartOptions): Promise<MatchRecord> {
    if (this.match) throw new SessionError('Đang có ván chưa kết thúc');
    const errors = validateLineup(options.session, options.lineup);
    if (errors.length > 0) throw new SessionError(errors.join('. '));

    const startedAt = this.now();
    this.match = {
      id: this.newId(),
      sessionId: options.session.id,
      index: options.index,
      startedAt,
      endedAt: null,
      lineup: { ...options.lineup },
      events: [],
      finalScore: null,
      winner: null,
      videoFileName: null,
      calibrationId: options.calibrationId,
    };
    this.engine = new MatchEngine(this.engineConfig, () => this.elapsed());
    this.warnings = [];
    this.endQuestion = null;

    if (this.deps.recorder) {
      try {
        await this.deps.recorder.start(videoBaseName(options.index, startedAt));
      } catch (error) {
        this.warnings.push(`Không ghi được video: ${(error as Error).message}. Vẫn chấm điểm bình thường.`);
      }
    }
    await this.persist();
    return this.match;
  }

  /** Mở lại ván đang dở sau khi tắt app. Video phần trước đã mất, phần sau ghi vào file mới. */
  async resume(record: MatchRecord): Promise<void> {
    if (this.match) throw new SessionError('Đang có ván chưa kết thúc');
    this.match = record;
    this.engine = MatchEngine.fromEvents(record.events, this.engineConfig, () => this.elapsed());
    this.warnings = [];
    if (this.deps.recorder) {
      try {
        await this.deps.recorder.start(`${videoBaseName(record.index, record.startedAt)}_tiep`);
      } catch (error) {
        this.warnings.push(`Không ghi được video: ${(error as Error).message}.`);
      }
    }
    this.syncReplayPrompt();
    this.emit();
  }

  observeServe(observation: ServeObservation): void {
    if (!this.engine || this.endQuestion) return;
    this.engine.observeServe(observation);
    this.afterChange();
  }

  /** Host trả lời popup; isReplay = true nghĩa là đúng là phát lại. */
  answerReplay(isReplay: boolean): void {
    if (!this.engine || !this.replayPrompt) return;
    this.engine.decideReplay(this.replayPrompt.observationId, isReplay);
    this.clearReplayPrompt();
    this.afterChange();
  }

  undo(): boolean {
    if (!this.engine) return false;
    const done = this.engine.undo();
    if (done) this.afterChange();
    return done;
  }

  /** Sửa tỉ số dự phòng. */
  setScore(score: Score, servingTeam: Team | null): void {
    if (!this.engine) return;
    this.engine.setScore(score, servingTeam);
    // Đang chờ host chọn tỉ số khi End thì sửa xong là kết thúc được.
    if (this.endQuestion?.kind === 'ambiguous') this.endQuestion = null;
    this.afterChange();
  }

  recordPositions(samples: PositionSample[]): void {
    if (!this.match) return;
    this.positions.push(...samples);
    if (this.positions.length >= POSITION_FLUSH_SIZE) void this.flushPositions();
  }

  /**
   * Host bấm End. Trả về null nếu ván đã được lưu; ngược lại trả về câu hỏi cần host trả lời
   * (chọn đội thắng pha cuối qua finishWith, hoặc sửa tỉ số rồi bấm End lại).
   */
  async requestEnd(): Promise<FinalRallyResolution | null> {
    if (!this.engine) return null;
    if (this.replayPrompt) this.answerReplay(false);
    const resolution = this.engine.finalRallyResolution();
    if (resolution.kind === 'ask' || resolution.kind === 'ambiguous') {
      this.endQuestion = resolution;
      this.emit();
      return resolution;
    }
    await this.finishWith(resolution.kind === 'auto' ? resolution.team : null);
    return null;
  }

  /** Host bấm "Quay lại ván" khi đang được hỏi lúc End. */
  cancelEnd(): void {
    this.endQuestion = null;
    this.emit();
  }

  /** Kết thúc ván, gán pha cuối cho team (null nếu không gán), lưu kết quả và video. */
  async finishWith(team: Team | null): Promise<MatchRecord | null> {
    if (!this.engine || !this.match) return null;
    this.clearReplayPrompt();
    this.engine.assignFinalRally(team);
    const state = this.engine.state;

    let videoFileName: string | null = null;
    if (this.deps.recorder) {
      try {
        videoFileName = await this.deps.recorder.stop();
      } catch (error) {
        this.warnings.push(`Không lưu được video: ${(error as Error).message}`);
      }
    }

    this.match = {
      ...this.match,
      events: [...this.engine.getEvents()],
      endedAt: this.now(),
      finalScore: { ...state.score },
      winner: state.winner,
      videoFileName,
    };
    await this.flushPositions();
    await this.persist();

    const finished = this.match;
    this.match = null;
    this.engine = null;
    this.endQuestion = null;
    this.emit();
    return finished;
  }

  /** Chờ mọi thao tác lưu đang chạy (dùng khi tắt app hoặc trong test). */
  async idle(): Promise<void> {
    await this.saving;
  }

  private afterChange(): void {
    if (!this.match || !this.engine) return;
    this.match = { ...this.match, events: [...this.engine.getEvents()] };
    this.syncReplayPrompt();
    void this.persist();
  }

  private syncReplayPrompt(): void {
    const pending = this.engine?.state.pendingReplay ?? null;
    if (!pending) {
      this.clearReplayPrompt();
      return;
    }
    if (this.replayPrompt?.observationId === pending.observationId) return;
    this.clearReplayPrompt();
    this.replayPrompt = { observationId: pending.observationId, deadline: this.now() + REPLAY_TIMEOUT_MS };
    // Hết 5 giây không ai bấm: coi như không phải phát lại (đội phát thắng liền 2 pha).
    this.replayTimer = setTimeout(() => this.answerReplay(false), REPLAY_TIMEOUT_MS);
  }

  private clearReplayPrompt(): void {
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.replayTimer = null;
    this.replayPrompt = null;
  }

  private async flushPositions(): Promise<void> {
    if (!this.match || this.positions.length === 0) return;
    const batch = this.positions;
    this.positions = [];
    const matchId = this.match.id;
    this.saving = this.saving.then(() => this.deps.store.appendPositions(matchId, batch));
    await this.saving;
  }

  private persist(): Promise<void> {
    this.emit();
    if (!this.match) return this.saving;
    const record = this.match;
    this.saving = this.saving.then(() => this.deps.store.saveMatch(record));
    return this.saving;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
