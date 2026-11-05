import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { CalibrationProfile } from '../data/types';
import { isBoxCutByTile, personFromBox, type PersonDetection } from './personBoxes';
import { planTiles, type Tile } from './tiling';

const WASM_PATH = '/mediapipe/wasm';
/** Chạy `npm run model` để tải model về máy, dùng được không cần internet. */
const LOCAL_MODEL = '/models/efficientdet_lite2.tflite';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite';

/** Số người tối đa mỗi ô: 4 người chơi cộng người chờ, người ở sân bên cạnh. */
const MAX_RESULTS = 10;
/** Ngưỡng thấp để bắt được người ở nửa sân xa (nhỏ, bị lưới che); người ngoài sân bị FrameProcessor và tracker loại. */
const MIN_SCORE = 0.25;

export async function hasLocalModel(): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    // Dev server trả về index.html cho file không tồn tại, nên phải kiểm tra loại nội dung.
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

let shared: Promise<ObjectDetector> | null = null;

/** Tạo (một lần) bộ phát hiện người dạng khung; ưu tiên GPU, lỗi thì chuyển sang CPU. */
export function getPersonDetector(): Promise<ObjectDetector> {
  shared ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const modelAssetPath = (await hasLocalModel()) ? LOCAL_MODEL : CDN_MODEL;
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'IMAGE' as const,
      categoryAllowlist: ['person'],
      scoreThreshold: MIN_SCORE,
      maxResults: MAX_RESULTS,
    });
    try {
      return await ObjectDetector.createFromOptions(vision, options('GPU'));
    } catch {
      return await ObjectDetector.createFromOptions(vision, options('CPU'));
    }
  })();
  shared.catch(() => (shared = null));
  return shared;
}

type FrameImage = HTMLVideoElement | HTMLCanvasElement;

function frameSize(image: FrameImage): [number, number] {
  return image instanceof HTMLVideoElement ? [image.videoWidth, image.videoHeight] : [image.width, image.height];
}

/**
 * Phát hiện người theo từng ô của khung hình (xem `planTiles`), trả về điểm chân chuẩn hóa theo cả khung.
 * Người bị mép ô cắt ngang bị bỏ; người nằm trọn trong hai ô chồng nhau xuất hiện hai lần và được
 * FrameProcessor gộp lại theo vị trí trên sân.
 */
export class TiledPersonDetector {
  /** Ô theo tỉ lệ 0..1 của khung, để dùng được khi độ phân giải camera khác lúc calibrate. */
  readonly tiles: Tile[];
  private readonly canvas = document.createElement('canvas');

  constructor(
    private readonly detector: ObjectDetector,
    calibration: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'>,
  ) {
    const { imageWidth: w, imageHeight: h } = calibration;
    this.tiles = planTiles(calibration).map((t) => ({ x: t.x / w, y: t.y / h, w: t.w / w, h: t.h / h }));
  }

  detect(image: FrameImage): PersonDetection[] {
    const [width, height] = frameSize(image);
    if (!width || !height) return [];
    const ctx = this.canvas.getContext('2d')!;
    const people: PersonDetection[] = [];
    for (const t of this.tiles) {
      const tile = {
        x: Math.round(t.x * width),
        y: Math.round(t.y * height),
        w: Math.round(t.w * width),
        h: Math.round(t.h * height),
      };
      this.canvas.width = tile.w;
      this.canvas.height = tile.h;
      ctx.drawImage(image, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
      for (const detection of this.detector.detect(this.canvas).detections) {
        const b = detection.boundingBox;
        if (!b) continue;
        const box = { x: b.originX, y: b.originY, w: b.width, h: b.height, score: detection.categories[0]?.score ?? 0 };
        if (isBoxCutByTile(box, tile, width, height)) continue;
        people.push(personFromBox(box, tile, width, height));
      }
    }
    return people;
  }
}
