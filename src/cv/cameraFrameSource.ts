import type { ObjectDetector } from '@mediapipe/tasks-vision';
import type { PositionFrame } from '../core/serveFormation';
import type { Team } from '../core/types';
import type { CalibrationProfile } from '../data/types';
import { FrameProcessor } from './frameProcessor';
import type { FrameSource } from './frameSource';
import { TiledPersonDetector } from './personDetector';

/** CV chỉ cần 10–15 khung/giây cho vị trí người chơi. */
const DEFAULT_FPS = 12;

/**
 * Lấy khung hình từ camera, phát hiện người (khung chữ nhật), quy về mét theo calibrate và gán 4 màu.
 * Dùng chung luồng camera với bộ ghi video.
 */
export class CameraFrameSource implements FrameSource {
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly processor: FrameProcessor;
  private readonly people: TiledPersonDetector;
  private startedAt = 0;
  private lastVideoTime = -1;

  constructor(
    private readonly getStream: () => MediaStream | null,
    calibration: CalibrationProfile,
    detector: ObjectDetector,
    private readonly fps = DEFAULT_FPS,
  ) {
    this.processor = new FrameProcessor(calibration);
    this.people = new TiledPersonDetector(detector, calibration);
  }

  start(onFrame: (frame: PositionFrame) => void): void {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    this.video = video;
    this.startedAt = performance.now();
    this.timer = setInterval(() => this.tick(onFrame), 1000 / this.fps);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }

  swapColors(team: Team): void {
    this.processor.tracker.swap(team);
  }

  private tick(onFrame: (frame: PositionFrame) => void): void {
    const video = this.video;
    if (!video) return;
    // Camera kết nối lại thì luồng mới khác luồng cũ.
    const stream = this.getStream();
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      if (stream) void video.play().catch(() => undefined);
    }
    if (!stream || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    const now = performance.now();
    onFrame(this.processor.process(now - this.startedAt, this.people.detect(video)));
  }
}
