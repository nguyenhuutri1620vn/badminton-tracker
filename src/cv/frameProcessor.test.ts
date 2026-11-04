import { describe, expect, it } from 'vitest';
import { MatchEngine } from '../core/scoreEngine';
import { ServeFormationDetector } from '../core/serveFormation';
import { FrameProcessor } from './frameProcessor';
import { MatchSimulator } from './simulator';
import { TEST_CALIBRATION, posesFromPositions } from './testing/landmarks';

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
    const detections = processor.toCourt(posesFromPositions(players));
    expect(detections).toHaveLength(2);
    detections.forEach((d, i) => expect(Math.hypot(d.x - players[i]!.x, d.y - players[i]!.y)).toBeLessThan(0.05));
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
        const frame = processor.process(truth.t, posesFromPositions(truth.players, TEST_CALIBRATION, bystanders));
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
        const obs = detector.push(processor.process(truth.t, posesFromPositions(truth.players)));
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
