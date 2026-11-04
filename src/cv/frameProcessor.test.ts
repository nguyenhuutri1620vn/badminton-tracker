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
});
