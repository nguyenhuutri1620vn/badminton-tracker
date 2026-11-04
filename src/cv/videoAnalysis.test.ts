import { describe, expect, it } from 'vitest';
import { MatchSimulator } from './simulator';
import { TEST_CALIBRATION, posesFromPositions } from './testing/landmarks';
import { VideoAnalysis, formatVideoTime } from './videoAnalysis';

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('VideoAnalysis', () => {
  it('phân tích "video" giả lập ra đúng tỉ số và dòng thời gian các lần phát', () => {
    const simulator = new MatchSimulator({ random: seededRandom(11), handSignalRate: 0.2 });
    const analysis = new VideoAnalysis(TEST_CALIBRATION);
    while (!simulator.finished) {
      const truth = simulator.next(1000 / 12);
      analysis.processFrame(truth.t, posesFromPositions(truth.players));
    }
    const summary = analysis.summary();
    expect(summary.entries.length).toBe(simulator.winners.length);
    expect(summary.fullFrameRatio).toBeGreaterThan(0.99);
    expect(analysis.finalScore()).toEqual(simulator.score);
    // Mốc thời gian tăng dần.
    const times = summary.entries.map((e) => e.observation.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('định dạng thời gian video', () => {
    expect(formatVideoTime(0)).toBe('0:00');
    expect(formatVideoTime(125_400)).toBe('2:05');
  });
});
