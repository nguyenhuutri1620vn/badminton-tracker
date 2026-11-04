import { courtLineSegments } from '../core/court';
import { applyHomography, COURT_CORNERS_M, solveHomography, type Point } from '../core/homography';

export const SAMPLE_SIZE = { width: 1280, height: 720 };

/** Góc sân trong ảnh mẫu: camera sau biên cuối, trên cao. */
const SAMPLE_CORNERS: Point[] = [
  [170, 690],
  [1110, 690],
  [860, 150],
  [420, 150],
];

/**
 * Vẽ ảnh sân mẫu (phối cảnh) để thử calibrate khi chưa có camera.
 * Trả về data URL PNG.
 */
export function renderSampleCourt(): string {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE.width;
  canvas.height = SAMPLE_SIZE.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a3b2f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const toImage = solveHomography(COURT_CORNERS_M, SAMPLE_CORNERS);
  const project = (p: Point) => applyHomography(toImage, p);

  ctx.fillStyle = '#2f6b4f';
  ctx.beginPath();
  SAMPLE_CORNERS.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = 3;
  for (const [a, b] of courtLineSegments()) {
    const [x1, y1] = project(a);
    const [x2, y2] = project(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}
