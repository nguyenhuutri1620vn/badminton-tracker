import { pickPreferredDevice, type VideoDeviceInfo } from './devices';
import type { SettingsStore } from './videoStorage';

export type CameraStatus = 'off' | 'connecting' | 'on' | 'lost' | 'error';

export interface CameraState {
  status: CameraStatus;
  deviceId: string | null;
  label: string | null;
  devices: VideoDeviceInfo[];
  width: number | null;
  height: number | null;
  error: string | null;
}

type MediaDevicesLike = Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices' | 'addEventListener'>;

const DEVICE_KEY = 'cameraDeviceId';
const RECONNECT_MS = 2000;

/**
 * Kết nối camera (iPhone qua Continuity Camera). Mất kết nối giữa ván thì tự thử lại mỗi 2 giây;
 * tỉ số không bị ảnh hưởng vì engine chỉ dừng nhận quan sát.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private state: CameraState = {
    status: 'off',
    deviceId: null,
    label: null,
    devices: [],
    width: null,
    height: null,
    error: null,
  };
  private listeners = new Set<(state: CameraState) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly mediaDevices: MediaDevicesLike | undefined = navigator.mediaDevices,
  ) {
    this.mediaDevices?.addEventListener('devicechange', () => void this.refreshDevices());
  }

  get current(): MediaStream | null {
    return this.stream;
  }

  getState(): CameraState {
    return this.state;
  }

  subscribe(listener: (state: CameraState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private set(partial: Partial<CameraState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  async refreshDevices(): Promise<VideoDeviceInfo[]> {
    if (!this.mediaDevices) return [];
    const devices = (await this.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
    this.set({ devices });
    return devices;
  }

  /** Kết nối camera; không truyền deviceId thì chọn iPhone hoặc camera đã dùng lần trước. */
  async connect(deviceId?: string): Promise<boolean> {
    if (!this.mediaDevices) {
      this.set({ status: 'error', error: 'Trình duyệt không hỗ trợ camera' });
      return false;
    }
    this.wanted = true;
    this.clearReconnect();
    this.set({ status: 'connecting', error: null });
    try {
      let target = deviceId;
      if (!target) {
        // Cần mở camera một lần để trình duyệt cho đọc tên thiết bị.
        if (this.state.devices.every((d) => d.label.startsWith('Camera '))) {
          const probe = await this.mediaDevices.getUserMedia({ video: true, audio: false });
          probe.getTracks().forEach((t) => t.stop());
        }
        const devices = await this.refreshDevices();
        const last = await this.settings.getSetting<string>(DEVICE_KEY);
        target = pickPreferredDevice(devices, last)?.deviceId;
      }
      const stream = await this.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: target ? { exact: target } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      this.attach(stream);
      if (target) await this.settings.setSetting(DEVICE_KEY, target);
      await this.refreshDevices();
      return true;
    } catch (error) {
      this.set({ status: 'error', error: describeError(error) });
      if (this.wanted && this.state.deviceId) this.scheduleReconnect();
      return false;
    }
  }

  disconnect(): void {
    this.wanted = false;
    this.clearReconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.set({ status: 'off' });
  }

  private attach(stream: MediaStream): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings();
    track?.addEventListener('ended', () => {
      if (this.stream !== stream) return;
      this.stream = null;
      this.set({ status: 'lost', error: 'Mất kết nối camera, đang thử kết nối lại…' });
      this.scheduleReconnect();
    });
    this.set({
      status: 'on',
      deviceId: settings?.deviceId ?? null,
      label: track?.label ?? null,
      width: settings?.width ?? null,
      height: settings?.height ?? null,
      error: null,
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const deviceId = this.state.deviceId ?? undefined;
    this.reconnectTimer = setTimeout(() => {
      if (this.wanted) void this.connect(deviceId);
    }, RECONNECT_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

function describeError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Chưa cho phép dùng camera. Bấm vào biểu tượng camera trên thanh địa chỉ để cho phép.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Không tìm thấy camera. Kiểm tra iPhone đã mở khóa, ở gần Mac và cùng Apple ID.';
  if (name === 'NotReadableError') return 'Camera đang được app khác dùng.';
  return (error as Error)?.message ?? 'Lỗi camera không rõ';
}
