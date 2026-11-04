// Chép file wasm của MediaPipe vào public/ để app chạy được không cần internet.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const target = resolve(root, 'public/mediapipe/wasm');

if (!existsSync(source)) {
  console.warn('Chưa cài @mediapipe/tasks-vision, bỏ qua bước chép wasm.');
} else {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log('Đã chép MediaPipe wasm vào public/mediapipe/wasm');
}
