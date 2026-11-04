import { useState } from 'preact/hooks';
import type { Score, Team } from '../../core/types';

/** Sửa tỉ số dự phòng khi app không tự giải quyết được. */
export function ScoreEditor({
  initial,
  labels,
  onSave,
  onCancel,
}: {
  initial: Score;
  labels: Record<Team, string>;
  onSave: (score: Score, servingTeam: Team | null) => void;
  onCancel: () => void;
}) {
  const [near, setNear] = useState(initial.near);
  const [far, setFar] = useState(initial.far);
  const [server, setServer] = useState<Team | ''>('');
  const clamp = (v: number) => Math.max(0, Math.min(30, Math.round(v) || 0));
  return (
    <div class="overlay">
      <div class="dialog">
        <h2>Sửa tỉ số</h2>
        <label>
          {labels.near} (đội gần)
          <input type="number" min={0} max={30} value={near} onInput={(e) => setNear(clamp(+e.currentTarget.value))} />
        </label>
        <label>
          {labels.far} (đội xa)
          <input type="number" min={0} max={30} value={far} onInput={(e) => setFar(clamp(+e.currentTarget.value))} />
        </label>
        <label>
          Đội đang phát cầu
          <select value={server} onChange={(e) => setServer(e.currentTarget.value as Team | '')}>
            <option value="">Chưa rõ (app tự suy ra)</option>
            <option value="near">{labels.near}</option>
            <option value="far">{labels.far}</option>
          </select>
        </label>
        <div class="actions">
          <button class="primary" onClick={() => onSave({ near, far }, server || null)}>
            Lưu
          </button>
          <button onClick={onCancel}>Hủy</button>
        </div>
      </div>
    </div>
  );
}
