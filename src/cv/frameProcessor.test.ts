import { describe, expect, it } from 'vitest';
import { MatchEngine } from '../core/scoreEngine';
import { ServeFormationDetector } from '../core/serveFormation';
import { FrameProcessor } from './frameProcessor';
import { MatchSimulator } from './simulator';
import { TEST_CALIBRATION, peopleFromPositions, personAt } from './testing/people';
import { courtMapping } from '../core/homography';
import { COURT } from '../core/court';

const formationPlayers = [
  { id: 'a', x: 1.5, y: 2 },
  { id: 'b', x: 4.5, y: 4.5 },
  { id: 'c', x: 1.5, y: 9 },
  { id: 'd', x: 4.5, y: 11.5 },
];

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('FrameProcessor', () => {
  it('đưa pose về đúng vị trí mét (sai số vài cm)', () => {
    const processor = new FrameProcessor(TEST_CALIBRATION);
    const players = [
      { id: 'a', x: 1.5, y: 2 },
      { id: 'b', x: 4.5, y: 4.5 },
    ];
    const detections = processor.toCourt(peopleFromPositions(players));
    expect(detections).toHaveLength(2);
    detections.forEach((d, i) => expect(Math.hypot(d.x - players[i]!.x, d.y - players[i]!.y)).toBeLessThan(0.05));
  });

  it('mỗi người kèm độ phân giải tại chỗ đứng: nửa xa mỗi pixel nhiều mét hơn nửa gần', () => {
    const processor = new FrameProcessor(TEST_CALIBRATION);
    let frame = processor.process(0, peopleFromPositions(formationPlayers));
    frame = processor.process(100, peopleFromPositions(formationPlayers));
    const near = frame.players.find((p) => p.y < COURT.netY)!;
    const far = frame.players.find((p) => p.y > COURT.netY)!;
    expect(near.metersPerPixel).toBeGreaterThan(0);
    expect(far.metersPerPixel!).toBeGreaterThan(2 * near.metersPerPixel!);
  });

  describe('người ở nửa xa bị băng lưới cắt ngang', () => {
    const { imageWidth: W, imageHeight: H } = TEST_CALIBRATION;
    const mapping = courtMapping(TEST_CALIBRATION.imageCorners);
    const groundY = (p: { foot: [number, number] }) => mapping.toCourt([p.foot[0] * W, p.foot[1] * H])[1];
    const full = personAt(2, 10.5);
    const heightPx = (full.foot[1] - full.top) * H;
    // Băng lưới trên ảnh: cao hơn chân một phần ba chiều cao người.
    const cut = personAt(2, 10.5, { cutAtImageY: full.foot[1] * H - heightPx / 3, confidence: 0.95 });

    it('khung bị cắt đặt chân sai hơn 1 m (kiểm tra dữ liệu giả lập)', () => {
      expect(groundY(cut) - 10.5).toBeGreaterThan(1);
    });

    it('thấy cả khung đủ lẫn khung bị cắt thì chỉ còn khung đủ', () => {
      const detections = new FrameProcessor(TEST_CALIBRATION).toCourt([cut, full]);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.y).toBeCloseTo(10.5, 1);
    });

    it('chỉ thấy khung bị cắt thì bỏ, để tracker giữ vị trí cũ', () => {
      expect(new FrameProcessor(TEST_CALIBRATION).toCourt([cut])).toHaveLength(0);
    });

    it('người đứng sát tường sau biên cuối (khung thấp) vẫn giữ để vùng nhận người tự loại', () => {
      const [d] = new FrameProcessor(TEST_CALIBRATION).toCourt([personAt(3, COURT.length + 2, { heightScale: 0.6 })]);
      expect(d!.y).toBeCloseTo(COURT.length + 2, 1);
    });

    it('hai người đứng thẳng hàng trước–sau ở nửa xa vẫn là hai người', () => {
      const detections = new FrameProcessor(TEST_CALIBRATION).toCourt([personAt(2, 9.5), personAt(2, 12.5)]);
      expect(detections.map((d) => d.y).sort((a, b) => a - b)).toEqual([expect.closeTo(9.5, 1), expect.closeTo(12.5, 1)]);
    });

    it('người ở nửa gần khom người không bị bỏ', () => {
      const [d] = new FrameProcessor(TEST_CALIBRATION).toCourt([personAt(2, COURT.netY - 2, { heightScale: 0.7 })]);
      expect(d!.y).toBeCloseTo(COURT.netY - 2, 1);
    });
  });

  it.each([1, 2, 3])(
    'cả ván từ pose giả lập (có người đứng ngoài sân) ra đúng tỉ số (seed %i)',
    (seed) => {
      const simulator = new MatchSimulator({ random: seededRandom(seed), handSignalRate: 0.3 });
      const processor = new FrameProcessor(TEST_CALIBRATION);
      const detector = new ServeFormationDetector();
      const engine = new MatchEngine();
      // Hai người chờ đứng ngoài biên dọc.
      const bystanders: [number, number][] = [
        [-2.5, 3],
        [8.5, 9],
      ];

      while (!simulator.finished) {
        const truth = simulator.next(1000 / 15);
        const frame = processor.process(truth.t, peopleFromPositions(truth.players, TEST_CALIBRATION, bystanders));
        const obs = detector.push(frame);
        if (obs) engine.observeServe(obs);
      }
      engine.end();
      expect(engine.state.score).toEqual(simulator.score);
    },
  );

  it('người chơi đứng chờ sau pha cuối không làm cộng thừa điểm (20 ván)', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const simulator = new MatchSimulator({ random: seededRandom(seed * 31), handSignalRate: 0.3 });
      const processor = new FrameProcessor(TEST_CALIBRATION);
      const detector = new ServeFormationDetector();
      const engine = new MatchEngine();
      const feed = () => {
        const truth = simulator.next(1000 / 15);
        const obs = detector.push(processor.process(truth.t, peopleFromPositions(truth.players)));
        if (!obs) return;
        engine.observeServe(obs);
        // Như khi host không bấm popup: hết giờ thì không phải phát lại.
        const pending = engine.state.pendingReplay;
        if (pending) engine.decideReplay(pending.observationId, false);
      };
      while (!simulator.finished) feed();
      for (let i = 0; i < 15 * 10; i += 1) feed();
      const resolution = engine.finalRallyResolution();
      if (resolution.kind === 'auto' || resolution.kind === 'none') engine.end();
      expect({ seed, score: engine.state.score }).toEqual({ seed, score: simulator.score });
    }
  });
});
