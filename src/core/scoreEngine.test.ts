import { describe, expect, it } from 'vitest';
import { MatchEngine, computeMatchState } from './scoreEngine';
import type { CourtPlayers, ServeObservation, ServiceCourt, Team } from './types';

let seq = 0;
function serve(servingTeam: Team | null, court: ServiceCourt, confidence = 1): ServeObservation {
  seq += 1;
  return { type: 'serve', id: `o${seq}`, t: seq * 10_000, servingTeam, court, confidence };
}

describe('pha phát cầu đầu ván', () => {
  it('đội phát đầu tiên đứng ô phải ở 0-0: chưa có điểm', () => {
    const state = computeMatchState([serve('near', 'right')]);
    expect(state.score).toEqual({ near: 0, far: 0 });
    expect(state.servingTeam).toBe('near');
    expect(state.rallies).toHaveLength(0);
  });

  it('lần phát đầu tiên camera thấy ở ô trái: suy ra đội đó đã thắng pha đầu', () => {
    const state = computeMatchState([serve('far', 'left')]);
    expect(state.score).toEqual({ near: 0, far: 1 });
    expect(state.rallies[0]?.inferred).toBe(true);
  });
});

describe('suy ra đội thắng pha từ đội hình phát cầu', () => {
  it('đội phát cầu thắng: người phát đổi ô', () => {
    const state = computeMatchState([serve('near', 'right'), serve('near', 'left')]);
    expect(state.score).toEqual({ near: 1, far: 0 });
    expect(state.servingTeam).toBe('near');
    expect(state.rallies[0]).toMatchObject({ winner: 'near', inferred: false });
  });

  it('đội nhận cầu thắng: họ phát ở ô theo chẵn lẻ điểm của mình', () => {
    const state = computeMatchState([serve('near', 'right'), serve('far', 'left')]);
    expect(state.score).toEqual({ near: 0, far: 1 });
    expect(state.servingTeam).toBe('far');
  });

  it('đội nhận cầu phát sai ô so với chẵn lẻ: suy ra họ thắng liền 2 pha (bỏ lỡ 1 lần phát)', () => {
    const state = computeMatchState([serve('near', 'right'), serve('far', 'right')]);
    expect(state.score).toEqual({ near: 0, far: 2 });
    expect(state.rallies.map((r) => r.inferred)).toEqual([true, true]);
  });

  it('một chuỗi pha bình thường', () => {
    const state = computeMatchState([
      serve('near', 'right'), // 0-0
      serve('near', 'left'), // 1-0
      serve('far', 'left'), // 1-1
      serve('far', 'right'), // 1-2
      serve('near', 'right'), // 2-2
    ]);
    expect(state.score).toEqual({ near: 2, far: 2 });
    expect(state.rallies.map((r) => r.winner)).toEqual(['near', 'far', 'far', 'near']);
  });
});

describe('phát lại / đội hình lặp lại', () => {
  it('đội hình giống hệt pha trước: chờ host xác nhận, chưa cộng điểm', () => {
    const repeat = serve('near', 'right');
    const later = serve('near', 'left');
    const state = computeMatchState([serve('near', 'right'), repeat, later]);
    expect(state.pendingReplay).toEqual({ observationId: repeat.id });
    expect(state.score).toEqual({ near: 0, far: 0 });
    expect(state.blockedEventCount).toBe(1);
  });

  it('host xác nhận phát lại: không cộng điểm, các pha sau tính bình thường', () => {
    const repeat = serve('near', 'right');
    const state = computeMatchState([
      serve('near', 'right'),
      repeat,
      { type: 'replayDecision', observationId: repeat.id, isReplay: true },
      serve('near', 'left'),
    ]);
    expect(state.pendingReplay).toBeNull();
    expect(state.score).toEqual({ near: 1, far: 0 });
  });

  it('không xác nhận (hết 5 giây): cộng +2 cho đội phát cầu', () => {
    const repeat = serve('near', 'right');
    const state = computeMatchState([
      serve('near', 'right'),
      repeat,
      { type: 'replayDecision', observationId: repeat.id, isReplay: false },
    ]);
    expect(state.score).toEqual({ near: 2, far: 0 });
    expect(state.rallies.every((r) => r.inferred)).toBe(true);
  });

  it('quyết định đến sau các quan sát khác vẫn được áp dụng đúng thứ tự', () => {
    const repeat = serve('near', 'right');
    const state = computeMatchState([
      serve('near', 'right'),
      repeat,
      serve('near', 'left'),
      { type: 'replayDecision', observationId: repeat.id, isReplay: true },
    ]);
    expect(state.score).toEqual({ near: 1, far: 0 });
  });
});

describe('quan sát độ tin cậy thấp', () => {
  it('được dùng khi giúp giải thích quan sát chắc chắn kế tiếp', () => {
    // Nếu bỏ quan sát thấp, near-right lặp lại sẽ gây popup; giữ nó thì chuỗi khớp hoàn toàn.
    const state = computeMatchState([
      serve('near', 'right'),
      serve('near', 'left', 0.3),
      serve('near', 'right'),
    ]);
    expect(state.pendingReplay).toBeNull();
    expect(state.score).toEqual({ near: 2, far: 0 });
  });

  it('bị bỏ qua khi chuỗi không khớp, quan sát chắc chắn được tính riêng', () => {
    const state = computeMatchState([
      serve('near', 'right'),
      serve('far', 'right', 0.3),
      serve('near', 'left'),
    ]);
    expect(state.score).toEqual({ near: 1, far: 0 });
    expect(state.notes.some((n) => n.kind === 'lowConfidenceDropped')).toBe(true);
  });

  it('chưa có quan sát chắc chắn sau đó: giữ ở trạng thái chờ, chưa cộng điểm', () => {
    const state = computeMatchState([serve('near', 'right'), serve('near', 'left', 0.3)]);
    expect(state.score).toEqual({ near: 0, far: 0 });
    expect(state.unresolvedLowConfidence).toBe(1);
  });
});

describe('kết thúc ván', () => {
  it('ván kết thúc ở 21 hơn 2 điểm, quan sát sau đó bị bỏ qua', () => {
    const state = computeMatchState([
      { type: 'manualScore', id: 'm1', t: 0, score: { near: 20, far: 19 }, servingTeam: 'near' },
      serve('near', 'left'),
      serve('near', 'right'),
    ]);
    expect(state.score).toEqual({ near: 21, far: 19 });
    expect(state.finished).toBe(true);
    expect(state.winner).toBe('near');
    expect(state.notes.some((n) => n.kind === 'afterFinish')).toBe(true);
  });

  it('+2 không vượt quá điểm kết thúc ván', () => {
    const repeat = serve('near', 'right');
    const state = computeMatchState([
      { type: 'manualScore', id: 'm1', t: 0, score: { near: 20, far: 19 }, servingTeam: 'near' },
      repeat,
      { type: 'replayDecision', observationId: repeat.id, isReplay: false },
    ]);
    expect(state.score).toEqual({ near: 21, far: 19 });
  });

  it('29-29: pha kế tiếp quyết định ván ở 30', () => {
    const state = computeMatchState([
      { type: 'manualScore', id: 'm1', t: 0, score: { near: 29, far: 29 }, servingTeam: 'near' },
      serve('far', 'right'),
    ]);
    expect(state.score).toEqual({ near: 29, far: 30 });
    expect(state.winner).toBe('far');
  });
});

describe('MatchEngine', () => {
  it('undo hoàn tác đúng pha gần nhất và tính lại từ lịch sử', () => {
    const engine = new MatchEngine();
    engine.observeServe(serve('near', 'right'));
    engine.observeServe(serve('near', 'left'));
    engine.observeServe(serve('far', 'left'));
    expect(engine.state.score).toEqual({ near: 1, far: 1 });

    expect(engine.undo()).toBe(true);
    expect(engine.state.score).toEqual({ near: 1, far: 0 });
    expect(engine.state.servingTeam).toBe('near');

    // Pha kế tiếp tính từ 1-0, near đang phát ô trái.
    engine.observeServe(serve('near', 'right'));
    expect(engine.state.score).toEqual({ near: 2, far: 0 });
  });

  it('undo khi chưa có pha nào trả về false', () => {
    const engine = new MatchEngine();
    engine.observeServe(serve('near', 'right'));
    expect(engine.undo()).toBe(false);
  });

  it('undo một lần sửa tỉ số tay', () => {
    const engine = new MatchEngine();
    engine.observeServe(serve('near', 'right'));
    engine.observeServe(serve('near', 'left'));
    engine.setScore({ near: 5, far: 3 }, 'near');
    expect(engine.undo()).toBe(true);
    expect(engine.state.score).toEqual({ near: 1, far: 0 });
  });

  it('sửa tỉ số tay: các pha sau tính từ tỉ số mới', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 5, far: 3 }, 'near'); // near 5 điểm, đang phát ô trái
    engine.observeServe(serve('near', 'right'));
    expect(engine.state.score).toEqual({ near: 6, far: 3 });
  });

  it('pha cuối: tự gán khi chỉ một đội có thể kết thúc ván', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 20, far: 18 }, 'near');
    expect(engine.finalRallyResolution()).toEqual({ kind: 'auto', team: 'near' });
    engine.end();
    expect(engine.state.score).toEqual({ near: 21, far: 18 });
    expect(engine.state.finished).toBe(true);
  });

  it('pha cuối: hỏi host khi không xác định được', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 29, far: 29 }, 'near');
    expect(engine.finalRallyResolution()).toEqual({ kind: 'ask', candidates: ['near', 'far'] });
    expect(() => engine.end()).toThrow();
    engine.assignFinalRally('far');
    expect(engine.state.score).toEqual({ near: 29, far: 30 });
    expect(engine.state.ended).toBe(true);
  });

  it('pha cuối: ván đã kết thúc thì không cần gán thêm', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 20, far: 19 }, 'near');
    engine.observeServe(serve('near', 'left'));
    expect(engine.finalRallyResolution()).toEqual({ kind: 'none' });
    engine.end();
    expect(engine.state.score).toEqual({ near: 21, far: 19 });
    expect(engine.state.ended).toBe(true);
  });

  it('host có thể chọn không gán điểm cho pha cuối', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 12, far: 10 }, 'near');
    expect(engine.finalRallyResolution()).toEqual({ kind: 'ask', candidates: [] });
    engine.assignFinalRally(null);
    expect(engine.state.score).toEqual({ near: 12, far: 10 });
    expect(engine.state.ended).toBe(true);
  });
});

describe('không rõ đội phát (thiếu tín hiệu tay)', () => {
  const manual = (near: number, far: number, servingTeam: Team | null) =>
    ({ type: 'manualScore', id: `m${near}-${far}`, t: 0, score: { near, far }, servingTeam }) as const;

  it('tổng điểm lẻ: ô giao cầu đủ để biết đội phát thắng', () => {
    // 3-2, near đang phát ô trái. Near thắng thì phát ô phải (4), far thắng thì phát ô trái (3).
    const state = computeMatchState([manual(3, 2, 'near'), serve(null, 'right')]);
    expect(state.score).toEqual({ near: 4, far: 2 });
    expect(state.scoreCertain).toBe(true);
    expect(state.servingTeam).toBe('near');
  });

  it('tổng điểm lẻ: ô giao cầu đủ để biết đội nhận thắng, không hiện popup', () => {
    const state = computeMatchState([manual(3, 2, 'near'), serve(null, 'left')]);
    expect(state.score).toEqual({ near: 3, far: 3 });
    expect(state.servingTeam).toBe('far');
    expect(state.pendingReplay).toBeNull();
  });

  it('tổng điểm chẵn: giữ 2 khả năng, hiển thị tỉ số chắc chắn gần nhất', () => {
    const state = computeMatchState([serve('near', 'right'), serve(null, 'left')]);
    expect(state.scoreCertain).toBe(false);
    expect(state.score).toEqual({ near: 0, far: 0 });
    expect(state.alternatives).toEqual(
      expect.arrayContaining([
        { near: 1, far: 0 },
        { near: 0, far: 1 },
      ]),
    );
  });

  it('quan sát biết chắc đội phát sau đó loại khả năng sai', () => {
    const state = computeMatchState([serve('near', 'right'), serve(null, 'left'), serve('near', 'right')]);
    // Chỉ nhánh "near thắng pha 1" giải thích được near phát ô phải mà không cần suy đoán.
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual({ near: 2, far: 0 });
    expect(state.rallies.map((r) => r.winner)).toEqual(['near', 'near']);
  });

  it('nhiều quan sát không rõ liên tiếp vẫn hội tụ khi có một quan sát chắc chắn', () => {
    const state = computeMatchState([
      serve('near', 'right'), // 0-0
      serve(null, 'left'), // near 1-0 hoặc far 0-1
      serve(null, 'left'), // near thắng tiếp sẽ phát ô phải, nên chỉ có thể là đội kia thắng: 1-1
      serve('far', 'right'), // far thắng: 1-2
    ]);
    expect(state.scoreCertain).toBe(true);
    // Thứ tự thắng các pha giữa vẫn có thể khác nhau, nhưng tỉ số thì chỉ có một khả năng.
    expect(state.score).toEqual({ near: 1, far: 2 });
  });

  it('cùng tỉ số nhưng chưa rõ đội phát: tỉ số vẫn chắc chắn', () => {
    const state = computeMatchState([serve('near', 'right'), serve(null, 'left'), serve(null, 'left')]);
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual({ near: 1, far: 1 });
    expect(state.servingTeam).toBeNull();
  });

  it('lần phát đầu tiên không rõ đội: chưa có điểm', () => {
    const state = computeMatchState([serve(null, 'right')]);
    expect(state.score).toEqual({ near: 0, far: 0 });
    expect(state.scoreCertain).toBe(true);
  });

  it('pha cuối khi tỉ số chưa chắc chắn: yêu cầu host chọn tỉ số', () => {
    const engine = new MatchEngine();
    engine.setScore({ near: 20, far: 18 }, 'near');
    engine.observeServe(serve(null, 'left')); // 20-18 tổng chẵn: near 21-18 (kết thúc) hoặc far 20-19
    const resolution = engine.finalRallyResolution();
    expect(resolution.kind).toBe('ambiguous');
    expect(() => engine.end()).toThrow();
  });
});

describe('theo dõi ai đứng ô nào trong mỗi đội', () => {
  const NEAR: CourtPlayers = { right: 'blue', left: 'red' };
  const NEAR_SWAPPED: CourtPlayers = { right: 'red', left: 'blue' };
  const FAR: CourtPlayers = { right: 'purple', left: 'yellow' };
  const FAR_SWAPPED: CourtPlayers = { right: 'yellow', left: 'purple' };

  function serveWith(servingTeam: Team | null, court: ServiceCourt, near: CourtPlayers, far: CourtPlayers): ServeObservation {
    return { ...serve(servingTeam, court), courtPlayers: { near, far } };
  }

  it('đội phát đổi chỗ: đội phát thắng pha, dù không rõ ai cầm cầu', () => {
    const state = computeMatchState([serveWith('near', 'right', NEAR, FAR), serveWith(null, 'left', NEAR_SWAPPED, FAR)]);
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual({ near: 1, far: 0 });
    expect(state.servingTeam).toBe('near');
  });

  it('không đội nào đổi chỗ: đội nhận cầu thắng pha', () => {
    const state = computeMatchState([serveWith('near', 'right', NEAR, FAR), serveWith(null, 'left', NEAR, FAR)]);
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual({ near: 0, far: 1 });
    expect(state.servingTeam).toBe('far');
  });

  it('đội nhận thắng rồi thắng tiếp khi phát: đội đó đổi chỗ đúng một lần', () => {
    const state = computeMatchState([
      serveWith(null, 'right', NEAR, FAR),
      serveWith(null, 'left', NEAR, FAR), // far thắng khi nhận: 0-1
      serveWith(null, 'right', NEAR, FAR_SWAPPED), // far thắng khi phát: 0-2
    ]);
    expect(state.scoreCertain).toBe(true);
    expect(state.score).toEqual({ near: 0, far: 2 });
  });

  it('bỏ lỡ một lần phát, đội kia thắng rồi bị gỡ lại: không ai đổi ô nên vẫn tính đủ 2 pha', () => {
    // 1-0, near phát ô trái (blue/red đã đổi chỗ). Far thắng (lần phát của far bị bỏ lỡ), near gỡ lại khi nhận:
    // near phát ô phải với 2 điểm, không ai đổi ô. Nếu chỉ có 1 pha near thắng khi phát thì near phải đổi ô.
    const state = computeMatchState([
      serveWith('near', 'right', NEAR, FAR),
      serveWith('near', 'left', NEAR_SWAPPED, FAR),
      serveWith(null, 'right', NEAR_SWAPPED, FAR),
    ]);
    expect(state.score).toEqual({ near: 2, far: 1 });
    expect(state.rallies.map((r) => r.winner)).toEqual(['near', 'far', 'near']);
  });

  it('tracking nhầm màu đội nhận cầu: không khả năng nào khớp, vẫn chọn theo ô giao cầu và ghi chú lại', () => {
    // 1-0, near phát ô trái. Near thắng tiếp nên phát ô phải và đổi chỗ; far không đổi nhưng bị báo đổi màu.
    const state = computeMatchState([
      serveWith('near', 'right', NEAR, FAR),
      serveWith('near', 'left', NEAR_SWAPPED, FAR),
      serveWith(null, 'right', NEAR, FAR_SWAPPED),
    ]);
    expect(state.score).toEqual({ near: 2, far: 0 });
    expect(state.notes.some((n) => n.kind === 'courtPlayersMismatch')).toBe(true);
  });
});
