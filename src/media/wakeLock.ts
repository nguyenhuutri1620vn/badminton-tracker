interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Giữ màn hình MacBook không tắt khi đang ghi ván. Trình duyệt tự nhả khóa khi tab bị ẩn,
 * nên khi tab hiện lại thì xin lại khóa.
 */
export class WakeLockGuard {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;

  constructor(
    private readonly api: WakeLockApi | undefined = (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock,
    private readonly doc: Pick<Document, 'visibilityState' | 'addEventListener'> = document,
  ) {
    this.doc.addEventListener('visibilitychange', () => {
      if (this.wanted && this.doc.visibilityState === 'visible') void this.acquire();
    });
  }

  get supported(): boolean {
    return Boolean(this.api);
  }

  get active(): boolean {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  async acquire(): Promise<boolean> {
    this.wanted = true;
    if (!this.api || this.active) return this.active;
    try {
      this.sentinel = await this.api.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) await sentinel.release();
  }
}
