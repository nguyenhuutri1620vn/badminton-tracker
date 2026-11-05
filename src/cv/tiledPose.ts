import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { CalibrationProfile } from '../data/types';
import type { Landmark } from './poseFeatures';
import { isCutByTile, planTiles, tileToFrameLandmarks, type Tile } from './tiling';

type FrameImage = HTMLVideoElement | HTMLCanvasElement;

function frameSize(image: FrameImage): [number, number] {
  return image instanceof HTMLVideoElement ? [image.videoWidth, image.videoHeight] : [image.width, image.height];
}

/**
 * Nhận diện người theo từng ô của khung hình (xem `planTiles`), trả về landmark chuẩn hóa theo cả khung.
 * Người bị mép ô cắt ngang bị bỏ (xem `isCutByTile`). Người nằm trọn trong hai ô chồng nhau xuất hiện hai lần;
 * FrameProcessor gộp lại theo vị trí trên sân.
 */
export class TiledPoseDetector {
  /** Ô theo tỉ lệ 0..1 của khung, để dùng được khi độ phân giải camera khác lúc calibrate. */
  readonly tiles: Tile[];
  private readonly canvas = document.createElement('canvas');

  constructor(
    private readonly landmarker: PoseLandmarker,
    calibration: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'>,
  ) {
    const { imageWidth: w, imageHeight: h } = calibration;
    this.tiles = planTiles(calibration).map((t) => ({ x: t.x / w, y: t.y / h, w: t.w / w, h: t.h / h }));
  }

  detect(image: FrameImage): Landmark[][] {
    const [width, height] = frameSize(image);
    if (!width || !height) return [];
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    const poses: Landmark[][] = [];
    for (const t of this.tiles) {
      const tile = { x: t.x * width, y: t.y * height, w: t.w * width, h: t.h * height };
      this.canvas.width = Math.round(tile.w);
      this.canvas.height = Math.round(tile.h);
      ctx.drawImage(image, tile.x, tile.y, tile.w, tile.h, 0, 0, this.canvas.width, this.canvas.height);
      for (const landmarks of this.landmarker.detect(this.canvas).landmarks) {
        if (isCutByTile(landmarks, tile, width, height)) continue;
        poses.push(tileToFrameLandmarks(landmarks, tile, width, height));
      }
    }
    return poses;
  }
}
