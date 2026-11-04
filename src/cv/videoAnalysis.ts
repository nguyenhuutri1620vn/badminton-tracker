import { MatchEngine } from '../core/scoreEngine';
import { ServeFormationDetector, type PlayerSample } from '../core/serveFormation';
import type { MatchState, Score, ServeObservation } from '../core/types';
import type { CalibrationProfile } from '../data/types';
import { FrameProcessor } from './frameProcessor';
import type { Landmark } from './poseFeatures';

export interface AnalysisEntry {
  observation: ServeObservation;
  /** Tỉ số app hiển thị ngay sau lần phát này. */
  scoreAfter: Score;
  scoreCertain: boolean;
}

export interface AnalysisSummary {
  frames: number;
  /** Tỉ lệ khung hình thấy đủ 4 người. */
  fullFrameRatio: number;
  entries: AnalysisEntry[];
  state: MatchState;
}

/**
 * Chạy lại toàn bộ pipeline (vị trí → đội hình phát cầu → engine) trên một video đã quay,
 * không cần host: popup phát lại được coi như hết giờ (+2), giống khi host không bấm gì.
 */
export class VideoAnalysis {
  private readonly processor: FrameProcessor;
  private readonly detector = new ServeFormationDetector();
  private readonly engine = new MatchEngine();
  private readonly entries: AnalysisEntry[] = [];
  private frames = 0;
  private fullFrames = 0;
  lastPlayers: PlayerSample[] = [];

  constructor(calibration: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'>) {
    this.processor = new FrameProcessor(calibration);
  }

  /** t: thời điểm trong video (ms). */
  processFrame(t: number, poses: Landmark[][]): AnalysisEntry | null {
    const frame = this.processor.process(t, poses);
    this.frames += 1;
    if (frame.players.length === 4) this.fullFrames += 1;
    this.lastPlayers = frame.players;

    const observation = this.detector.push(frame);
    if (!observation) return null;
    this.engine.observeServe(observation);
    const pending = this.engine.state.pendingReplay;
    if (pending) this.engine.decideReplay(pending.observationId, false);

    const state = this.engine.state;
    const entry = { observation, scoreAfter: { ...state.score }, scoreCertain: state.scoreCertain };
    this.entries.push(entry);
    return entry;
  }

  summary(): AnalysisSummary {
    return {
      frames: this.frames,
      fullFrameRatio: this.frames === 0 ? 0 : this.fullFrames / this.frames,
      entries: [...this.entries],
      state: this.engine.state,
    };
  }

  /** Tỉ số cuối cùng nếu gán pha cuối như khi host bấm End (null nếu cần host chọn). */
  finalScore(): Score | null {
    const resolution = this.engine.finalRallyResolution();
    const score = this.engine.state.score;
    if (resolution.kind === 'none') return { ...score };
    if (resolution.kind === 'auto') return { ...score, [resolution.team]: score[resolution.team] + 1 };
    return null;
  }
}

/** Định dạng mm:ss cho mốc thời gian trong video. */
export function formatVideoTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
