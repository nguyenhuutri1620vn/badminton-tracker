import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { CameraManager, CameraState } from '../media/cameraManager';
import type { VideoStorage } from '../media/videoStorage';
import type { WakeLockGuard } from '../media/wakeLock';

/** Các dịch vụ gắn với trình duyệt (camera, thư mục video, giữ màn hình sáng). */
export interface Services {
  camera: CameraManager;
  storage: VideoStorage;
  wakeLock: WakeLockGuard;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('Thiếu Services');
  return services;
}

export function useCameraState(): CameraState {
  const { camera } = useServices();
  const [state, setState] = useState(camera.getState());
  useEffect(() => camera.subscribe(setState), [camera]);
  return state;
}
