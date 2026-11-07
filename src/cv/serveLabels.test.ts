import { describe, expect, it } from 'vitest';
import { addLabel, evaluateServeTeams, parseLabelFile, removeNearestLabel, serializeLabels } from './serveLabels';

describe('nhãn phát cầu', () => {
  it('thêm nhãn giữ thứ tự thời gian; bấm lại trong 1 giây thì thay nhãn cũ', () => {
    let labels = addLabel([], { t: 5000, team: 'near' });
    labels = addLabel(labels, { t: 2000, team: 'far' });
    expect(labels.map((l) => l.t)).toEqual([2000, 5000]);
    labels = addLabel(labels, { t: 5400, team: 'far' });
    expect(labels).toEqual([
      { t: 2000, team: 'far' },
      { t: 5400, team: 'far' },
    ]);
  });

  it('xóa nhãn gần thời điểm đang xem nhất (trong 3 giây)', () => {
    const labels = [
      { t: 2000, team: 'far' as const },
      { t: 9000, team: 'near' as const },
    ];
    expect(removeNearestLabel(labels, 8000)).toEqual([{ t: 2000, team: 'far' }]);
    expect(removeNearestLabel(labels, 5500)).toEqual(labels);
  });

  it('xuất rồi đọc lại được; file sai định dạng thì báo lỗi', () => {
    const text = serializeLabels('van1.mp4', [{ t: 1000, team: 'near' }]);
    expect(parseLabelFile(text)).toEqual({ video: 'van1.mp4', labels: [{ t: 1000, team: 'near' }] });
    expect(() => parseLabelFile('{"labels":[{"t":"x","team":"near"}]}')).toThrow();
    expect(() => parseLabelFile('không phải json')).toThrow();
  });
});

describe('đánh giá đội phát so với nhãn', () => {
  const labels = [
    { t: 10_000, team: 'near' as const },
    { t: 25_000, team: 'far' as const },
    { t: 40_000, team: 'far' as const },
    { t: 60_000, team: 'near' as const },
  ];

  it('ghép mỗi nhãn với dự đoán gần nhất trong khoảng cho phép, đếm đúng, sai, chưa rõ, bỏ lỡ, thừa', () => {
    const result = evaluateServeTeams(
      [
        { t: 9_000, team: 'near' },
        { t: 26_500, team: 'near' },
        { t: 41_000, team: null },
        { t: 50_000, team: 'far' },
      ],
      labels,
    );
    expect(result).toMatchObject({ labels: 4, correct: 1, wrongTeam: 1, unknownTeam: 1, missed: 1, extra: 1 });
    // Độ chính xác chỉ tính trên các lần đã đưa ra đội phát.
    expect(result.accuracy).toBeCloseTo(0.5);
  });

  it('một dự đoán chỉ ghép với một nhãn', () => {
    const result = evaluateServeTeams([{ t: 24_000, team: 'far' }], [
      { t: 23_000, team: 'far' },
      { t: 25_000, team: 'far' },
    ]);
    expect(result).toMatchObject({ correct: 1, missed: 1, extra: 0 });
  });
});
