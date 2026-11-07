import type { Tile } from './tiling';

/** Người phát hiện được trong một khung hình, tọa độ chuẩn hóa 0..1 theo cả khung. */
export interface PersonDetection {
  /** Điểm chạm sân: giữa đáy khung người. */
  foot: [number, number];
  /** Đỉnh khung (đầu), chuẩn hóa theo chiều cao khung hình. Vẫn đúng khi chân bị lưới che. */
  top: number;
  /** Tay cầm vợt giơ cao hơn vai; null khi không biết (bộ phát hiện khung không thấy được tay). */
  handRaised: boolean | null;
  /** Độ tin cậy của bộ phát hiện. */
  confidence: number;
}

/** Khung chữ nhật quanh một người (pixel của ảnh đưa vào bộ phát hiện). */
export interface PersonBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/** Khung chạm mép trong khoảng này (pixel) thì coi là bị mép cắt. */
const EDGE_PX = 2;

/**
 * Người bị mép ô cắt ngang (mép đó không phải mép khung hình): đáy khung khi đó là mép ô chứ không phải chân,
 * nên vị trí trên sân sai cả mét. Bỏ được vì `planTiles` bảo đảm người đó nằm trọn trong một ô khác.
 * Mép trên không tính: đầu hay vợt bị cắt không làm sai vị trí chân.
 */
export function isBoxCutByTile(box: PersonBox, tile: Tile, frameWidth: number, frameHeight: number): boolean {
  const cutLeft = tile.x > 0.5 && box.x <= EDGE_PX;
  const cutRight = tile.x + tile.w < frameWidth - 0.5 && box.x + box.w >= tile.w - EDGE_PX;
  const cutBottom = tile.y + tile.h < frameHeight - 0.5 && box.y + box.h >= tile.h - EDGE_PX;
  return cutLeft || cutRight || cutBottom;
}

/** Khung trong ô (pixel của ô) thành người với điểm chân chuẩn hóa theo cả khung hình. */
export function personFromBox(box: PersonBox, tile: Tile, frameWidth: number, frameHeight: number): PersonDetection {
  return {
    foot: [(tile.x + box.x + box.w / 2) / frameWidth, (tile.y + box.y + box.h) / frameHeight],
    top: (tile.y + box.y) / frameHeight,
    handRaised: null,
    confidence: box.score,
  };
}
