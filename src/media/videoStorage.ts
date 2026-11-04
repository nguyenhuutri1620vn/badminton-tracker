/** Nơi ghi từng đoạn video của một ván. */
export interface VideoSink {
  write(chunk: Blob): Promise<void>;
  /** Đóng file, trả về tên file đã lưu. */
  close(): Promise<string>;
}

export interface SettingsStore {
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
}

const DIRECTORY_KEY = 'videoDirectory';

type PermissionMode = { mode: 'readwrite' };

interface DirectoryHandleLike {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(descriptor: PermissionMode): Promise<PermissionState>;
  requestPermission?(descriptor: PermissionMode): Promise<PermissionState>;
}

interface FileHandleLike {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}

/** Ghi thẳng vào file trong thư mục đã chọn: không giữ cả video trong bộ nhớ. */
class DirectoryFileSink implements VideoSink {
  private writable: Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    file: FileHandleLike,
    private readonly fileName: string,
  ) {
    this.writable = file.createWritable();
  }

  write(chunk: Blob): Promise<void> {
    this.queue = this.queue.then(async () => (await this.writable).write(chunk));
    return this.queue;
  }

  async close(): Promise<string> {
    await this.queue;
    await (await this.writable).close();
    return this.fileName;
  }
}

/** Dự phòng khi chưa chọn thư mục: gom trong bộ nhớ rồi tải file về thư mục Downloads. */
class DownloadSink implements VideoSink {
  private chunks: Blob[] = [];

  constructor(
    private readonly fileName: string,
    private readonly mimeType: string,
    private readonly download: (fileName: string, blob: Blob) => void,
  ) {}

  async write(chunk: Blob): Promise<void> {
    this.chunks.push(chunk);
  }

  async close(): Promise<string> {
    this.download(this.fileName, new Blob(this.chunks, { type: this.mimeType }));
    this.chunks = [];
    return this.fileName;
  }
}

function browserDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Quản lý thư mục lưu video (File System Access API), nhớ thư mục giữa các lần mở app. */
export class VideoStorage {
  private directory: DirectoryHandleLike | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly pickDirectory: (() => Promise<DirectoryHandleLike>) | null = defaultPicker(),
    private readonly download: (fileName: string, blob: Blob) => void = browserDownload,
  ) {}

  get supported(): boolean {
    return this.pickDirectory !== null;
  }

  get directoryName(): string | null {
    return this.directory?.name ?? null;
  }

  /** Nạp thư mục đã chọn lần trước (chưa xin quyền; quyền được xin khi host bấm nút). */
  async load(): Promise<void> {
    this.directory = (await this.settings.getSetting<DirectoryHandleLike>(DIRECTORY_KEY)) ?? null;
  }

  /** Mở hộp chọn thư mục; phải gọi từ thao tác bấm của host. */
  async chooseDirectory(): Promise<string | null> {
    if (!this.pickDirectory) return null;
    const handle = await this.pickDirectory();
    this.directory = handle;
    await this.settings.setSetting(DIRECTORY_KEY, handle);
    return handle.name;
  }

  /** Kiểm tra (và nếu được phép thì xin) quyền ghi vào thư mục đã nhớ. */
  async ensurePermission(request = false): Promise<boolean> {
    const dir = this.directory;
    if (!dir) return false;
    const mode: PermissionMode = { mode: 'readwrite' };
    if (!dir.queryPermission) return true;
    if ((await dir.queryPermission(mode)) === 'granted') return true;
    if (!request || !dir.requestPermission) return false;
    return (await dir.requestPermission(mode)) === 'granted';
  }

  async createSink(fileName: string, mimeType: string): Promise<VideoSink> {
    if (this.directory && (await this.ensurePermission())) {
      const file = await this.directory.getFileHandle(fileName, { create: true });
      return new DirectoryFileSink(file, fileName);
    }
    return new DownloadSink(fileName, mimeType, this.download);
  }

  /** Mở file video đã lưu để xem lại; null nếu không có thư mục hoặc không tìm thấy file. */
  async openFile(fileName: string): Promise<File | null> {
    if (!this.directory || !(await this.ensurePermission(true))) return null;
    try {
      return await (await this.directory.getFileHandle(fileName)).getFile();
    } catch {
      return null;
    }
  }
}

function defaultPicker(): (() => Promise<DirectoryHandleLike>) | null {
  const w = globalThis as unknown as {
    showDirectoryPicker?: (options: { mode: 'readwrite'; id?: string }) => Promise<DirectoryHandleLike>;
  };
  if (!w.showDirectoryPicker) return null;
  return () => w.showDirectoryPicker!({ mode: 'readwrite', id: 'badminton-videos' });
}
