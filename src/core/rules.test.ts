import { describe, expect, it } from 'vitest';
import { courtForScore, isGameOver, teamsThatCanFinishWithOnePoint, winnerOf } from './rules';

describe('isGameOver', () => {
  it.each([
    [21, 19, true],
    [19, 21, true],
    [21, 20, false],
    [20, 20, false],
    [22, 20, true],
    [29, 28, false],
    [29, 29, false],
    [30, 29, true],
    [0, 0, false],
  ])('%i-%i → %s', (near, far, expected) => {
    expect(isGameOver({ near, far })).toBe(expected);
  });
});

describe('winnerOf', () => {
  it('trả về đội thắng khi ván kết thúc', () => {
    expect(winnerOf({ near: 21, far: 15 })).toBe('near');
    expect(winnerOf({ near: 29, far: 30 })).toBe('far');
  });

  it('trả về null khi ván chưa kết thúc', () => {
    expect(winnerOf({ near: 20, far: 20 })).toBeNull();
  });
});

describe('courtForScore', () => {
  it('điểm chẵn phát ô phải, lẻ phát ô trái', () => {
    expect(courtForScore(0)).toBe('right');
    expect(courtForScore(1)).toBe('left');
    expect(courtForScore(20)).toBe('right');
  });
});

describe('teamsThatCanFinishWithOnePoint', () => {
  it.each([
    [20, 18, ['near']],
    [18, 20, ['far']],
    [20, 20, []],
    [29, 29, ['near', 'far']],
    [10, 5, []],
  ])('%i-%i → %j', (near, far, expected) => {
    expect(teamsThatCanFinishWithOnePoint({ near, far })).toEqual(expected);
  });
});
