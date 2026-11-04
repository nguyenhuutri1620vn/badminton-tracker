import { useEffect, useRef } from 'preact/hooks';

/** Hiện hình camera; dùng chung luồng với bộ ghi video và CV nên không mở camera lần nữa. */
export function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream) return <div class="camera-preview empty muted">Chưa có hình</div>;
  return <video ref={ref} class="camera-preview" autoPlay muted playsInline />;
}
