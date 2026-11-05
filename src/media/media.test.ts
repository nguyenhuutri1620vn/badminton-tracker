import { describe, expect, it } from 'vitest';
import { CameraManager } from './cameraManager';
import { pickPreferredDevice } from './devices';
import { chooseMimeType, extensionFor } from './format';
import { MatchVideoRecorder, type RecorderEnv } from './matchVideoRecorder';
import { VideoStorage, type VideoSink } from './videoStorage';
import { WakeLockGuard } from './wakeLock';

describe('định dạng video', () => {
  it('ưu tiên mp4, không có thì webm', () => {
    expect(chooseMimeType((t) => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1.640028');
    expect(chooseMimeType((t) => t === 'video/webm;codecs=vp9')).toBe('video/webm;codecs=vp9');
    expect(chooseMimeType(() => false)).toBeNull();
    expect(extensionFor('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensionFor('video/webm')).toBe('webm');
  });
});

describe('chọn camera', () => {
  const devices = [
    { deviceId: 'a', label: 'FaceTime HD Camera' },
    { deviceId: 'b', label: 'iPhone của Tri Camera' },
  ];
  it('ưu tiên camera dùng lần trước, sau đó iPhone, cuối cùng camera đầu tiên', () => {
    expect(pickPreferredDevice(devices, 'a')?.deviceId).toBe('a');
    expect(pickPreferredDevice(devices)?.deviceId).toBe('b');
    expect(pickPreferredDevice([devices[0]!])?.deviceId).toBe('a');
    expect(pickPreferredDevice([])).toBeNull();
  });
});

class FakeRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly options: MediaRecorderOptions) {}
  start() {
    this.state = 'recording';
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
  stop() {
    this.emit('cuối');
    this.state = 'inactive';
    this.onstop?.();
  }
}

class MemorySink implements VideoSink {
  chunks: string[] = [];
  closed = false;
  constructor(readonly name: string) {}
  async write(chunk: Blob) {
    this.chunks.push(await chunk.text());
  }
  async close() {
    this.closed = true;
    return this.name;
  }
}

function setup(supported = (t: string) => t.startsWith('video/mp4')) {
  const recorders: FakeRecorder[] = [];
  const sinks: MemorySink[] = [];
  const env: RecorderEnv = {
    createRecorder: (_s, options) => {
      const r = new FakeRecorder(options);
      recorders.push(r);
      return r;
    },
    isTypeSupported: supported,
  };
  const storage = {
    createSink: async (name: string) => {
      const sink = new MemorySink(name);
      sinks.push(sink);
      return sink;
    },
  };
  let stream: MediaStream | null = {} as MediaStream;
  const recorder = new MatchVideoRecorder(() => stream, storage, env);
  return { recorder, recorders, sinks, setStream: (s: MediaStream | null) => (stream = s) };
}

describe('MatchVideoRecorder', () => {
  it('ghi một ván thành một file mp4, ghi đủ các đoạn', async () => {
    const { recorder, recorders, sinks } = setup();
    await recorder.start('van-01');
    recorders[0]!.emit('a');
    recorders[0]!.emit('b');
    expect(await recorder.stop()).toBe('van-01.mp4');
    expect(sinks[0]!.chunks).toEqual(['a', 'b', 'cuối']);
    expect(sinks[0]!.closed).toBe(true);
    expect(recorders[0]!.options.mimeType).toContain('video/mp4');
  });

  it('chưa có camera thì báo lỗi rõ ràng', async () => {
    const { recorder, setStream } = setup();
    setStream(null);
    await expect(recorder.start('van-01')).rejects.toThrow('Chưa kết nối camera');
  });

  it('camera mất rồi kết nối lại: ghi tiếp sang file phần 2', async () => {
    const { recorder, recorders, sinks } = setup((t) => t === 'video/webm');
    await recorder.start('van-02');
    recorders[0]!.stop(); // track kết thúc làm recorder tự dừng
    await recorder.resumeAfterReconnect();
    recorders[1]!.emit('x');
    expect(await recorder.stop()).toBe('van-02.webm, van-02_phan2.webm');
    expect(sinks.map((s) => s.closed)).toEqual([true, true]);
  });

  it('chưa start thì stop trả về null', async () => {
    expect(await setup().recorder.stop()).toBeNull();
  });
});

describe('VideoStorage', () => {
  function memorySettings() {
    const map = new Map<string, unknown>();
    return {
      getSetting: async <T,>(k: string) => map.get(k) as T | undefined,
      setSetting: async (k: string, v: unknown) => void map.set(k, v),
    };
  }

  it('chưa chọn thư mục: gom dữ liệu rồi tải về', async () => {
    const downloads: [string, number][] = [];
    const storage = new VideoStorage(memorySettings(), null, (name, blob) => downloads.push([name, blob.size]));
    const sink = await storage.createSink('van.mp4', 'video/mp4');
    await sink.write(new Blob(['abc']));
    expect(await sink.close()).toBe('van.mp4');
    expect(downloads).toEqual([['van.mp4', 3]]);
  });

  it('đã chọn thư mục: ghi thẳng vào file, nhớ thư mục cho lần sau', async () => {
    const written: string[] = [];
    const files = new Map<string, string[]>();
    const dir = {
      name: 'Video cầu lông',
      queryPermission: async () => 'granted' as PermissionState,
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({
          write: async (b: Blob) => void written.push(await b.text()),
          close: async () => void files.set(name, written),
        }),
        getFile: async () => new File(files.get(name) ?? [], name),
      }),
    };
    const settings = memorySettings();
    const storage = new VideoStorage(settings, async () => dir);
    expect(await storage.chooseDirectory()).toBe('Video cầu lông');

    const reloaded = new VideoStorage(settings, async () => dir);
    await reloaded.load();
    expect(reloaded.directoryName).toBe('Video cầu lông');
    const sink = await reloaded.createSink('van-01.mp4', 'video/mp4');
    await sink.write(new Blob(['x']));
    await sink.write(new Blob(['y']));
    await sink.close();
    expect(files.get('van-01.mp4')).toEqual(['x', 'y']);
    expect((await reloaded.openFile('van-01.mp4'))?.name).toBe('van-01.mp4');
  });
});

describe('WakeLockGuard', () => {
  it('xin khóa khi ghi, xin lại khi tab hiện lại, nhả khi kết thúc', async () => {
    let requests = 0;
    const sentinels: { released: boolean; release(): Promise<void> }[] = [];
    const api = {
      request: async () => {
        requests += 1;
        const s = { released: false, release: async () => void (s.released = true) };
        sentinels.push(s);
        return s;
      },
    };
    let onVisibility: () => void = () => {};
    const doc = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (_: string, cb: () => void) => void (onVisibility = cb),
    } as unknown as Pick<Document, 'visibilityState' | 'addEventListener'>;

    const guard = new WakeLockGuard(api, doc);
    expect(await guard.acquire()).toBe(true);
    sentinels[0]!.released = true; // trình duyệt tự nhả khi tab ẩn
    onVisibility();
    await Promise.resolve();
    expect(requests).toBe(2);
    await guard.release();
    expect(guard.active).toBe(false);
  });
});

describe('chia sẻ tab/màn hình thay camera', () => {
  function fakeStream() {
    const listeners: Record<string, () => void> = {};
    const track = {
      label: 'web-contents-media-stream://youtube',
      getSettings: () => ({ width: 1920, height: 1080 }),
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      stop: () => undefined,
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    return { stream, end: () => listeners.ended?.() };
  }
  const settings = { getSetting: async () => undefined, setSetting: async () => undefined };

  it('dùng được như camera, dừng chia sẻ thì về trạng thái tắt và không tự kết nối lại', async () => {
    const { stream, end } = fakeStream();
    let userMediaCalls = 0;
    const devices = {
      getUserMedia: async () => {
        userMediaCalls += 1;
        throw new Error('không dùng');
      },
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      getDisplayMedia: async () => stream,
    };
    const camera = new CameraManager(settings, devices as never);
    expect(await camera.connectScreen()).toBe(true);
    expect(camera.getState()).toMatchObject({ status: 'on', width: 1920, height: 1080 });
    expect(camera.current).toBe(stream);

    end();
    expect(camera.getState().status).toBe('off');
    expect(camera.current).toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(userMediaCalls).toBe(0);
  });

  it('người dùng hủy hộp thoại chọn tab thì báo lỗi rõ ràng', async () => {
    const devices = {
      getUserMedia: async () => fakeStream().stream,
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      getDisplayMedia: async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    };
    const camera = new CameraManager(settings, devices as never);
    expect(await camera.connectScreen()).toBe(false);
    expect(camera.getState()).toMatchObject({ status: 'error', error: 'Đã hủy chia sẻ màn hình' });
  });
});
