import { useEffect, useState } from 'preact/hooks';
import type { ReplayPrompt } from '../../app/matchController';

/** Popup "Phát lại?" đếm ngược 5 giây; hết giờ controller tự coi là không phải phát lại. */
export function ReplayPopup({ prompt, onAnswer }: { prompt: ReplayPrompt; onAnswer: (isReplay: boolean) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((prompt.deadline - now) / 1000));
  return (
    <div class="overlay">
      <div class="dialog replay">
        <h2>Phát lại?</h2>
        <p>Đội hình giống hệt lần phát trước. Nếu không xác nhận, đội phát cầu được +2.</p>
        <div class="countdown">{seconds}s</div>
        <div class="actions">
          <button class="primary big" onClick={() => onAnswer(true)}>
            Đúng, phát lại
          </button>
          <button class="big" onClick={() => onAnswer(false)}>
            Không, +2
          </button>
        </div>
      </div>
    </div>
  );
}
