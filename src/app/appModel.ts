import { ServeFormationDetector, type PlayerSample, type PositionFrame } from '../core/serveFormation';
import type { Score, Team } from '../core/types';
import type { FrameSource } from '../cv/frameSource';
import { SimulatedFrameSource } from '../cv/simulator';
import type { Repository } from '../data/repository';
import type { CalibrationProfile, Lineup, MatchRecord, PlayerColor, PositionSample, Session } from '../data/types';
import { MatchController, type ControllerSnapshot, type MatchRecorder } from './matchController';
import {
  SessionError,
  addPlayer,
  createSession,
  endSession,
  markLeft,
  markReturned,
  renamePlayer,
} from './session';

export type Screen = 'session' | 'setup' | 'live' | 'history' | 'calibrate' | 'checklist' | 'analyze';

export type SourceKind = 'none' | 'simulator' | 'camera';

export interface AppState {
  ready: boolean;
  screen: Screen;
  session: Session | null;
  matches: MatchRecord[];
  live: ControllerSnapshot;
  /** Vị trí mới nhất của người chơi cho mini map. */
  positions: PlayerSample[];
  source: SourceKind;
  /** Chế độ giả lập: tỉ số thật của giả lập để so với tỉ số app chấm. */
  simulatorTruth: Score | null;
  /** Số khung vị trí mỗi giây nguồn đang cung cấp. */
  sourceFps: number;
  /** Các profile calibrate đã lưu và profile đang dùng. */
  calibrations: CalibrationProfile[];
  calibration: CalibrationProfile | null;
  /** Khung hình (data URL) gửi từ màn hình khác sang màn hình calibrate. */
  calibrationImage: { src: string; width: number; height: number } | null;
  error: string | null;
}

const ACTIVE_CALIBRATION_KEY = 'activeCalibrationId';

export interface AppDeps {
  repo: Repository;
  /** Tạo bộ ghi video cho mỗi ván; null khi không ghi (chế độ giả lập, test). */
  createRecorder?: () => MatchRecorder | null;
  now?: () => number;
  newId?: () => string;
}

/** Lấy mẫu vị trí để lưu: 10 lần mỗi giây. */
const POSITION_SAMPLE_MS = 100;

type Listener = (state: AppState) => void;

/** Trạng thái và thao tác của toàn app; giao diện chỉ đọc state và gọi các hàm này. */
export class AppModel {
  private state: AppState;
  private listeners = new Set<Listener>();
  private controller: MatchController;
  private detector = new ServeFormationDetector();
  private source: FrameSource | null = null;
  private lastSampleT = -Infinity;
  private frameTimes: number[] = [];
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: AppDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.controller = this.createController();
    this.state = {
      ready: false,
      screen: 'session',
      session: null,
      matches: [],
      live: this.controller.snapshot(),
      positions: [],
      source: 'none',
      simulatorTruth: null,
      sourceFps: 0,
      calibrations: [],
      calibration: null,
      calibrationImage: null,
      error: null,
    };
  }

  private createController(): MatchController {
    const controller = new MatchController({
      store: this.deps.repo,
      recorder: this.deps.createRecorder?.() ?? null,
      now: this.now,
      newId: this.newId,
    });
    controller.subscribe((live) => this.set({ live }));
    return controller;
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Bọc thao tác của host: lỗi nghiệp vụ hiện lên màn hình thay vì làm hỏng app. */
  private async guard<T>(action: () => Promise<T> | T): Promise<T | undefined> {
    try {
      this.set({ error: null });
      return await action();
    } catch (error) {
      if (error instanceof SessionError) {
        this.set({ error: error.message });
        return undefined;
      }
      throw error;
    }
  }

  async init(): Promise<void> {
    await this.loadCalibrations();
    const session = (await this.deps.repo.getActiveSession()) ?? null;
    const matches = session ? await this.deps.repo.listMatches(session.id) : [];
    this.set({ session, matches });
    const open = session ? matches.find((m) => m.endedAt === null) : undefined;
    if (open) {
      await this.controller.resume(open);
      this.set({ screen: 'live' });
    } else if (session) {
      this.set({ screen: session.players.length >= 4 ? 'setup' : 'session' });
    }
    this.set({ ready: true });
  }

  navigate(screen: Screen): void {
    this.set({ screen, error: null });
  }

  dismissError(): void {
    this.set({ error: null });
  }

  // Buổi chơi và người chơi

  private async saveSession(session: Session): Promise<void> {
    await this.deps.repo.saveSession(session);
    this.set({ session });
  }

  private requireSession(): Session {
    if (!this.state.session) throw new SessionError('Chưa bắt đầu buổi chơi');
    return this.state.session;
  }

  newSession(): Promise<void | undefined> {
    return this.guard(async () => {
      if (this.state.session) throw new SessionError('Buổi chơi hiện tại chưa kết thúc');
      await this.saveSession(createSession(this.newId(), this.now()));
      this.set({ matches: [], screen: 'session' });
    });
  }

  finishSession(): Promise<void | undefined> {
    return this.guard(async () => {
      if (this.controller.isActive) throw new SessionError('Kết thúc ván đang chơi trước');
      await this.deps.repo.saveSession(endSession(this.requireSession(), this.now()));
      this.set({ session: null, matches: [], screen: 'session' });
    });
  }

  addPlayer(name: string): Promise<void | undefined> {
    return this.guard(() => this.saveSession(addPlayer(this.requireSession(), this.newId(), name, this.now())));
  }

  renamePlayer(playerId: string, name: string): Promise<void | undefined> {
    return this.guard(() => this.saveSession(renamePlayer(this.requireSession(), playerId, name)));
  }

  markLeft(playerId: string): Promise<void | undefined> {
    return this.guard(() => this.saveSession(markLeft(this.requireSession(), playerId, this.now())));
  }

  markReturned(playerId: string): Promise<void | undefined> {
    return this.guard(() => this.saveSession(markReturned(this.requireSession(), playerId)));
  }

  // Calibrate

  private async loadCalibrations(): Promise<void> {
    const calibrations = await this.deps.repo.listCalibrations();
    const activeId = await this.deps.repo.getSetting<string>(ACTIVE_CALIBRATION_KEY);
    const calibration = calibrations.find((c) => c.id === activeId) ?? calibrations[0] ?? null;
    this.set({ calibrations, calibration });
  }

  async saveCalibration(profile: Omit<CalibrationProfile, 'id' | 'createdAt'> & { id?: string }): Promise<CalibrationProfile> {
    const saved: CalibrationProfile = { ...profile, id: profile.id ?? this.newId(), createdAt: this.now() };
    await this.deps.repo.saveCalibration(saved);
    await this.deps.repo.setSetting(ACTIVE_CALIBRATION_KEY, saved.id);
    await this.loadCalibrations();
    return saved;
  }

  /** Mở màn hình calibrate với khung hình cho trước (ví dụ lấy từ video đã quay). */
  calibrateFromImage(image: { src: string; width: number; height: number }): void {
    this.set({ calibrationImage: image, screen: 'calibrate' });
  }

  consumeCalibrationImage(): AppState['calibrationImage'] {
    const image = this.state.calibrationImage;
    if (image) this.set({ calibrationImage: null });
    return image;
  }

  async useCalibration(id: string): Promise<void> {
    await this.deps.repo.setSetting(ACTIVE_CALIBRATION_KEY, id);
    await this.loadCalibrations();
  }

  // Ván

  startMatch(lineup: Lineup, calibrationId: string | null = this.state.calibration?.id ?? null): Promise<void | undefined> {
    return this.guard(async () => {
      const session = this.requireSession();
      this.detector = new ServeFormationDetector();
      this.lastSampleT = -Infinity;
      const index = this.state.matches.length + 1;
      await this.controller.start({ session, lineup, index, calibrationId });
      this.set({ screen: 'live', matches: await this.deps.repo.listMatches(session.id) });
    });
  }

  answerReplay(isReplay: boolean): void {
    this.controller.answerReplay(isReplay);
  }

  undo(): void {
    this.controller.undo();
  }

  setScore(score: Score, servingTeam: Team | null): void {
    this.controller.setScore(score, servingTeam);
  }

  /** Host bấm End. Trả về true nếu ván đã được lưu, false nếu cần host trả lời thêm. */
  async requestEnd(): Promise<boolean> {
    const question = await this.controller.requestEnd();
    if (question) return false;
    await this.afterMatchEnded();
    return true;
  }

  cancelEnd(): void {
    this.controller.cancelEnd();
  }

  async finishWith(team: Team | null): Promise<void> {
    await this.controller.finishWith(team);
    await this.afterMatchEnded();
  }

  private async afterMatchEnded(): Promise<void> {
    this.stopSource();
    const session = this.state.session;
    const matches = session ? await this.deps.repo.listMatches(session.id) : [];
    this.set({ matches, screen: 'setup', positions: [] });
  }

  // Nguồn khung hình (camera hoặc giả lập)

  attachSource(source: FrameSource, kind: SourceKind): void {
    this.stopSource();
    this.source = source;
    this.detector = new ServeFormationDetector();
    this.lastSampleT = -Infinity;
    source.start((frame) => this.handleFrame(frame));
    this.set({ source: kind });
  }

  swapColors(team: Team): void {
    this.source?.swapColors?.(team);
  }

  stopSource(): void {
    this.source?.stop();
    this.source = null;
    this.frameTimes = [];
    if (this.state.source !== 'none') this.set({ source: 'none', sourceFps: 0 });
  }

  /** Một khung hình vị trí: cập nhật mini map, lưu vị trí, đưa vào bộ phát hiện đội hình phát cầu. */
  handleFrame(frame: PositionFrame): void {
    const truth = this.source instanceof SimulatedFrameSource ? { ...this.source.simulator.score } : null;
    const now = this.now();
    this.frameTimes = [...this.frameTimes.filter((t) => now - t < 2000), now];
    this.set({ positions: frame.players, simulatorTruth: truth, sourceFps: this.frameTimes.length / 2 });
    if (!this.controller.isActive) return;

    // Mốc thời gian lưu là thời gian kể từ khi bắt đầu ván (khớp với video), không phải của nguồn.
    const matchT = this.controller.elapsed();
    if (frame.t - this.lastSampleT >= POSITION_SAMPLE_MS) {
      this.lastSampleT = frame.t;
      const samples: PositionSample[] = frame.players.map((p) => ({
        t: matchT,
        color: p.id as PlayerColor,
        x: p.x,
        y: p.y,
      }));
      this.controller.recordPositions(samples);
    }

    const observation = this.detector.push(frame);
    if (observation) this.controller.observeServe({ ...observation, t: matchT });
  }

  /** Chờ mọi thao tác lưu (dùng trong test và trước khi đóng). */
  idle(): Promise<void> {
    return this.controller.idle();
  }
}
