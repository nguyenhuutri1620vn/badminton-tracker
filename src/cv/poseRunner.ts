import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
/** Chạy `npm run model` để tải model về máy, dùng được không cần internet. */
const LOCAL_MODEL = '/models/pose_landmarker_lite.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Số người tối đa trong một ô (xem `TiledPoseDetector`): mỗi ô thường chỉ chứa 1–2 người. */
const NUM_POSES = 3;
const MIN_CONFIDENCE = 0.25;

export async function hasLocalModel(): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    // Dev server trả về index.html cho file không tồn tại, nên phải kiểm tra loại nội dung.
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

let shared: Promise<PoseLandmarker> | null = null;

/**
 * Tạo (một lần) bộ nhận diện pose; ưu tiên GPU, lỗi thì chuyển sang CPU.
 * Chế độ IMAGE vì mỗi khung được cắt thành nhiều ô, các ô không liên tục với nhau như một luồng video.
 */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  shared ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const modelAssetPath = (await hasLocalModel()) ? LOCAL_MODEL : CDN_MODEL;
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'IMAGE' as const,
      numPoses: NUM_POSES,
      // Ngưỡng thấp để bắt được người ở nửa sân xa (nhỏ, bị lưới che chân); người giả ngoài sân bị
      // FrameProcessor và tracker loại.
      minPoseDetectionConfidence: MIN_CONFIDENCE,
      minPosePresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
    });
    try {
      return await PoseLandmarker.createFromOptions(vision, options('GPU'));
    } catch {
      return await PoseLandmarker.createFromOptions(vision, options('CPU'));
    }
  })();
  shared.catch(() => (shared = null));
  return shared;
}
