import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
/** Chạy `npm run model` để tải model về máy, dùng được không cần internet. */
const LOCAL_MODEL = '/models/pose_landmarker_lite.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Số người tối đa nhận diện: 4 người chơi cộng người chờ đứng gần sân. */
const NUM_POSES = 6;

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

/** Tạo (một lần) bộ nhận diện pose; ưu tiên GPU, lỗi thì chuyển sang CPU. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  shared ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const modelAssetPath = (await hasLocalModel()) ? LOCAL_MODEL : CDN_MODEL;
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO' as const,
      numPoses: NUM_POSES,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
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
