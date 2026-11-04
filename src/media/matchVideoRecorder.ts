import type { MatchRecorder } from '../app/matchController';
import { chooseMimeType, extensionFor } from './format';
import type { VideoSink } from './videoStorage';

interface RecorderLike {
  state: 'inactive' | 'recording' | 'paused';
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export interface RecorderEnv {
  createRecorder(stream: MediaStream, options: MediaRecorderOptions): RecorderLike;
  isTypeSupported(type: string): boolean;
}

export interface SinkFactory {
  createSink(fileName: string, mimeType: string): Promise<VideoSink>;
}

const browserEnv = (): RecorderEnv => ({
  createRecorder: (stream, options) => new MediaRecorder(stream, options) as unknown as RecorderLike,
  isTypeSupported: (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
});

/** Ghi mỗi 2 giây một đoạn để mất điện hay tắt app đột ngột chỉ mất vài giây cuối. */
const TIMESLICE_MS = 2000;
const VIDEO_BITS_PER_SECOND = 5_000_000;

interface Segment {
  recorder: RecorderLike;
  sink: VideoSink;
  stopped: Promise<void>;
}

/**
 * Ghi video của một ván. Nếu camera mất kết nối rồi kết nối lại giữa ván thì ghi tiếp sang file mới
 * (…_phan2, …_phan3); stop() trả về danh sách file cách nhau bởi dấu phẩy.
 */
export class MatchVideoRecorder implements MatchRecorder {
  private baseName: string | null = null;
  private segment: Segment | null = null;
  private files: string[] = [];
  private finished: Promise<void>[] = [];

  constructor(
    private readonly getStream: () => MediaStream | null,
    private readonly storage: SinkFactory,
    private readonly env: RecorderEnv = browserEnv(),
  ) {}

  get recording(): boolean {
    return this.segment?.recorder.state === 'recording';
  }

  async start(fileBaseName: string): Promise<void> {
    this.baseName = fileBaseName;
    this.files = [];
    this.finished = [];
    await this.startSegment();
  }

  /** Gọi khi camera vừa kết nối lại trong lúc đang có ván. */
  async resumeAfterReconnect(): Promise<void> {
    if (!this.baseName || this.recording) return;
    await this.startSegment();
  }

  async stop(): Promise<string | null> {
    if (!this.baseName) return null;
    const segment = this.segment;
    this.segment = null;
    if (segment && segment.recorder.state !== 'inactive') segment.recorder.stop();
    await Promise.all(this.finished);
    this.baseName = null;
    return this.files.length > 0 ? this.files.join(', ') : null;
  }

  private async startSegment(): Promise<void> {
    const stream = this.getStream();
    if (!stream) throw new Error('Chưa kết nối camera');
    const mimeType = chooseMimeType((t) => this.env.isTypeSupported(t));
    if (!mimeType) throw new Error('Trình duyệt không ghi được video');

    const part = this.files.length + 1;
    const fileName = `${this.baseName}${part > 1 ? `_phan${part}` : ''}.${extensionFor(mimeType)}`;
    const sink = await this.storage.createSink(fileName, mimeType);
    const recorder = this.env.createRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });

    const writes: Promise<void>[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) writes.push(sink.write(event.data));
    };
    // Đoạn kết thúc khi host bấm End hoặc khi camera mất (track kết thúc làm recorder tự dừng).
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        void Promise.all(writes)
          .then(() => sink.close())
          .then(() => resolve());
      };
    });
    this.files.push(fileName);
    this.finished.push(stopped);
    this.segment = { recorder, sink, stopped };
    recorder.start(TIMESLICE_MS);
  }
}
