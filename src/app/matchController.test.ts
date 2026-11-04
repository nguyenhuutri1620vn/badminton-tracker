import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchController, REPLAY_TIMEOUT_MS, videoBaseName, type MatchRecorder, type MatchStore } from './matchController';
import { addPlayer, createSession } from './session';
import type { ServeObservation, ServiceCourt, Team } from '../core/types';
import type { Lineup, MatchRecord, PositionSample, Session } from '../data/types';

class MemoryStore implements MatchStore {
  matches = new Map<string, MatchRecord>();
  positions = new Map<string, PositionSample[]>();
  async saveMatch(match: MatchRecord) {
    this.matches.set(match.id, structuredClone(match));
  }
  async appendPositions(matchId: string, samples: PositionSample[]) {
    this.positions.set(matchId, [...(this.positions.get(matchId) ?? []), ...samples]);
  }
}

class FakeRecorder implements MatchRecorder {
  started: string[] = [];
  stopped = 0;
  failStart = false;
  async start(name: string) {
    if (this.failStart) throw new Error('không có camera');
    this.started.push(name);
  }
  async stop() {
    this.stopped += 1;
    return `${this.started.at(-1)}.mp4`;
  }
}

const session: Session = ['An', 'Bình', 'Chi', 'Dũng'].reduce(
  (s, name, i) => addPlayer(s, `p${i + 1}`, name, 0),
  createSession('s1', 0),
);
const lineup: Lineup = { blue: 'p1', red: 'p2', purple: 'p3', yellow: 'p4' };

let seq = 0;
const serve = (servingTeam: Team | null, court: ServiceCourt): ServeObservation => {
  seq += 1;
  return { type: 'serve', id: `o${seq}`, t: seq * 1000, servingTeam, court, confidence: 0.9 };
};

let store: MemoryStore;
let recorder: FakeRecorder;
let controller: MatchController;
let ids = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 3, 19, 5));
  store = new MemoryStore();
  recorder = new FakeRecorder();
  controller = new MatchController({ store, recorder, newId: () => `m${++ids}` });
});

afterEach(() => vi.useRealTimers());

async function startMatch() {
  return controller.start({ session, lineup, index: 3, calibrationId: 'c1' });
}

describe('MatchController', () => {
  it('Start tạo ván 0-0, bắt đầu ghi video và lưu ngay', async () => {
    const match = await startMatch();
    expect(recorder.started).toEqual(['van-03_2026-11-03_19-05']);
    expect(controller.snapshot().state?.score).toEqual({ near: 0, far: 0 });
    await controller.idle();
    expect(store.matches.get(match.id)?.endedAt).toBeNull();
  });

  it('không cho Start khi đội hình sai hoặc đang có ván', async () => {
    await expect(controller.start({ session, lineup: { ...lineup, red: 'p1' }, index: 1, calibrationId: null })).rejects.toThrow(
      'Mỗi người chỉ được mang một màu',
    );
    await startMatch();
    await expect(startMatch()).rejects.toThrow('Đang có ván chưa kết thúc');
  });

  it('không ghi được video vẫn chấm điểm, có cảnh báo', async () => {
    recorder.failStart = true;
    await startMatch();
    expect(controller.snapshot().warnings[0]).toContain('Không ghi được video');
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'left'));
    expect(controller.snapshot().state?.score).toEqual({ near: 1, far: 0 });
  });

  it('mỗi quan sát được lưu để khôi phục', async () => {
    const match = await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'left'));
    await controller.idle();
    expect(store.matches.get(match.id)?.events).toHaveLength(2);
  });

  it('popup phát lại: hết 5 giây thì +2', async () => {
    await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'right'));
    expect(controller.snapshot().replayPrompt).not.toBeNull();
    vi.advanceTimersByTime(REPLAY_TIMEOUT_MS);
    expect(controller.snapshot().replayPrompt).toBeNull();
    expect(controller.snapshot().state?.score).toEqual({ near: 2, far: 0 });
  });

  it('popup phát lại: host xác nhận thì không cộng điểm, hẹn giờ bị hủy', async () => {
    await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'right'));
    controller.answerReplay(true);
    vi.advanceTimersByTime(REPLAY_TIMEOUT_MS * 2);
    expect(controller.snapshot().state?.score).toEqual({ near: 0, far: 0 });
  });

  it('undo và sửa tỉ số', async () => {
    await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'left'));
    expect(controller.undo()).toBe(true);
    expect(controller.snapshot().state?.score).toEqual({ near: 0, far: 0 });
    controller.setScore({ near: 10, far: 8 }, 'far');
    expect(controller.snapshot().state?.score).toEqual({ near: 10, far: 8 });
  });

  it('End tự gán pha cuối, lưu kết quả, dừng video, về trạng thái chưa có ván', async () => {
    const match = await startMatch();
    controller.setScore({ near: 20, far: 17 }, 'near');
    vi.setSystemTime(new Date(2026, 10, 3, 19, 20));
    expect(await controller.requestEnd()).toBeNull();
    await controller.idle();
    const saved = store.matches.get(match.id)!;
    expect(saved.finalScore).toEqual({ near: 21, far: 17 });
    expect(saved.winner).toBe('near');
    expect(saved.endedAt).not.toBeNull();
    expect(saved.videoFileName).toBe('van-03_2026-11-03_19-05.mp4');
    expect(recorder.stopped).toBe(1);
    expect(controller.isActive).toBe(false);
  });

  it('End hỏi host khi không xác định được pha cuối', async () => {
    const match = await startMatch();
    controller.setScore({ near: 29, far: 29 }, 'near');
    expect(await controller.requestEnd()).toEqual({ kind: 'ask', candidates: ['near', 'far'] });
    expect(controller.snapshot().endQuestion).not.toBeNull();
    await controller.finishWith('far');
    expect(store.matches.get(match.id)?.finalScore).toEqual({ near: 29, far: 30 });
  });

  it('vị trí được gom và ghi khi kết thúc ván', async () => {
    const match = await startMatch();
    controller.recordPositions([{ t: 0, color: 'blue', x: 1, y: 1 }]);
    controller.recordPositions([{ t: 100, color: 'red', x: 2, y: 2 }]);
    expect(store.positions.get(match.id)).toBeUndefined();
    await controller.finishWith(null);
    await controller.idle();
    expect(store.positions.get(match.id)).toHaveLength(2);
  });

  it('khôi phục ván đang dở từ bản đã lưu', async () => {
    const match = await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'left'));
    await controller.idle();

    const reopened = new MatchController({ store, recorder, newId: () => 'x' });
    await reopened.resume(store.matches.get(match.id)!);
    expect(reopened.snapshot().state?.score).toEqual({ near: 1, far: 0 });
    expect(recorder.started.at(-1)).toBe('van-03_2026-11-03_19-05_tiep');
    reopened.observeServe(serve('near', 'right'));
    expect(reopened.snapshot().state?.score).toEqual({ near: 2, far: 0 });
  });

  it('thông báo cho người nghe mỗi khi tỉ số thay đổi', async () => {
    const scores: string[] = [];
    controller.subscribe((s) => s.state && scores.push(`${s.state.score.near}-${s.state.score.far}`));
    await startMatch();
    controller.observeServe(serve('near', 'right'));
    controller.observeServe(serve('near', 'left'));
    expect(scores.at(-1)).toBe('1-0');
  });
});

describe('videoBaseName', () => {
  it('đặt tên theo số ván và giờ bắt đầu', () => {
    expect(videoBaseName(1, new Date(2026, 0, 2, 8, 9).getTime())).toBe('van-01_2026-01-02_08-09');
  });
});
