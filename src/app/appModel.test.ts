import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModel } from './appModel';
import { MatchSimulator } from '../cv/simulator';
import { Repository } from '../data/repository';
import type { Lineup } from '../data/types';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

let repo: Repository;
let model: AppModel;
let dbCounter = 0;
let ids = 0;

beforeEach(async () => {
  dbCounter += 1;
  repo = await Repository.open(`app-${dbCounter}`);
  model = new AppModel({ repo, newId: () => `id${++ids}` });
  await model.init();
});

afterEach(() => repo.close());

async function setupFourPlayers(): Promise<Lineup> {
  await model.newSession();
  for (const name of ['An', 'Bình', 'Chi', 'Dũng']) await model.addPlayer(name);
  const [a, b, c, d] = model.getState().session!.players.map((p) => p.id);
  return { blue: a!, red: b!, purple: c!, yellow: d! };
}

describe('AppModel', () => {
  it('tạo buổi, thêm người, báo lỗi tên trùng mà không làm hỏng app', async () => {
    await setupFourPlayers();
    await model.addPlayer('an');
    expect(model.getState().error).toContain('Đã có người tên');
    expect(model.getState().session?.players).toHaveLength(4);
  });

  it('chơi trọn một ván giả lập: tỉ số khớp với giả lập và được lưu', async () => {
    const lineup = await setupFourPlayers();
    await model.startMatch(lineup);
    expect(model.getState().screen).toBe('live');

    const simulator = new MatchSimulator({ random: seededRandom(7), handSignalRate: 0 });
    while (!simulator.finished) model.handleFrame(simulator.next(1000 / 15));

    // Pha cuối không có lần phát tiếp theo: app tự gán khi host bấm End.
    expect(await model.requestEnd()).toBe(true);
    await model.idle();
    const [saved] = await repo.listMatches(model.getState().session!.id);
    expect(saved?.finalScore).toEqual(simulator.score);
    expect(model.getState().screen).toBe('setup');
    expect((await repo.getPositions(saved!.id)).length).toBeGreaterThan(100);
  });

  it('mở lại app giữa ván thì khôi phục tỉ số', async () => {
    const lineup = await setupFourPlayers();
    await model.startMatch(lineup);
    const simulator = new MatchSimulator({ random: seededRandom(3), handSignalRate: 1 });
    for (let i = 0; i < 15 * 30; i += 1) model.handleFrame(simulator.next(1000 / 15));
    await model.idle();
    const before = model.getState().live.state!.score;
    expect(before.near + before.far).toBeGreaterThan(0);

    const reopened = new AppModel({ repo, newId: () => `r${++ids}` });
    await reopened.init();
    expect(reopened.getState().screen).toBe('live');
    expect(reopened.getState().live.state?.score).toEqual(before);
  });

  it('không cho kết thúc buổi khi đang có ván', async () => {
    const lineup = await setupFourPlayers();
    await model.startMatch(lineup);
    await model.finishSession();
    expect(model.getState().error).toBe('Kết thúc ván đang chơi trước');
  });

  it('lưu calibrate, dùng làm mặc định cho ván mới, nhớ sau khi mở lại', async () => {
    const corners: [number, number][] = [
      [100, 900],
      [1800, 900],
      [1300, 300],
      [600, 300],
    ];
    const saved = await model.saveCalibration({ name: 'Sân quen', imageWidth: 1920, imageHeight: 1080, imageCorners: corners });
    expect(model.getState().calibration?.id).toBe(saved.id);

    const lineup = await setupFourPlayers();
    await model.startMatch(lineup);
    expect(model.getState().live.match?.calibrationId).toBe(saved.id);

    const reopened = new AppModel({ repo, newId: () => `c${++ids}` });
    await reopened.init();
    expect(reopened.getState().calibration?.name).toBe('Sân quen');
  });
});
