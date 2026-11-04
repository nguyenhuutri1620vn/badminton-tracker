export interface VideoDeviceInfo {
  deviceId: string;
  label: string;
}

/** Ưu tiên camera iPhone (Continuity Camera), sau đó camera đã chọn lần trước, cuối cùng camera đầu tiên. */
export function pickPreferredDevice(devices: VideoDeviceInfo[], lastDeviceId?: string | null): VideoDeviceInfo | null {
  const last = devices.find((d) => d.deviceId === lastDeviceId);
  if (last) return last;
  const iphone = devices.find((d) => /iphone|continuity/i.test(d.label));
  return iphone ?? devices[0] ?? null;
}
