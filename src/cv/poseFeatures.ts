/** Một điểm pose của MediaPipe: x, y chuẩn hóa 0..1 theo khung hình; visibility 0..1. */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

/** Người phát hiện được trong một khung hình, tọa độ chuẩn hóa. */
export interface PersonDetection {
  /** Điểm chạm sân (giữa hai chân). */
  foot: [number, number];
  /** Tay cầm vợt giơ cao hơn vai; null khi không thấy rõ tay. */
  handRaised: boolean | null;
  /** Độ tin cậy của điểm chân. */
  confidence: number;
}

// Chỉ số landmark của MediaPipe Pose (33 điểm).
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_ANKLE = 27;
const R_ANKLE = 28;
const L_HEEL = 29;
const R_HEEL = 30;

const VISIBLE = 0.5;

const visible = (p: Landmark | undefined): p is Landmark => Boolean(p && (p.visibility ?? 1) >= VISIBLE);

function midpoint(points: Landmark[]): [number, number] {
  return [points.reduce((s, p) => s + p.x, 0) / points.length, points.reduce((s, p) => s + p.y, 0) / points.length];
}

/**
 * Lấy điểm chạm sân và tín hiệu tay từ 33 landmark.
 * Chân bị che thì ước lượng từ hông (chân thường cách hông khoảng 1,1 lần khoảng hông–vai).
 */
export function extractPerson(landmarks: Landmark[]): PersonDetection | null {
  const feet = [landmarks[L_ANKLE], landmarks[R_ANKLE], landmarks[L_HEEL], landmarks[R_HEEL]].filter(visible);
  const hips = [landmarks[L_HIP], landmarks[R_HIP]].filter(visible);
  const shoulders = [landmarks[L_SHOULDER], landmarks[R_SHOULDER]].filter(visible);

  let foot: [number, number];
  let confidence: number;
  if (feet.length > 0) {
    foot = midpoint(feet);
    confidence = feet.length >= 2 ? 0.9 : 0.7;
  } else if (hips.length > 0 && shoulders.length > 0) {
    const [hx, hy] = midpoint(hips);
    const [, sy] = midpoint(shoulders);
    foot = [hx, hy + (hy - sy) * 1.1];
    confidence = 0.4;
  } else {
    return null;
  }

  return { foot, handRaised: detectHandRaised(landmarks), confidence };
}

/** Một trong hai cổ tay cao hơn vai cùng bên (y nhỏ hơn) ít nhất 3% chiều cao khung hình. */
export function detectHandRaised(landmarks: Landmark[]): boolean | null {
  const pairs: [Landmark | undefined, Landmark | undefined][] = [
    [landmarks[L_WRIST], landmarks[L_SHOULDER]],
    [landmarks[R_WRIST], landmarks[R_SHOULDER]],
  ];
  let seen = false;
  for (const [wrist, shoulder] of pairs) {
    if (!visible(wrist) || !visible(shoulder)) continue;
    seen = true;
    if (wrist.y < shoulder.y - 0.03) return true;
  }
  return seen ? false : null;
}
