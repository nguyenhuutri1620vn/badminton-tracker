import type { Screen } from '../app/appModel';
import { useAppState, useModel } from './context';
import { AnalyzeScreen } from './screens/AnalyzeScreen';
import { CalibrateScreen } from './screens/CalibrateScreen';
import { DevicesScreen } from './screens/DevicesScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { LiveScreen } from './screens/LiveScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SetupScreen } from './screens/SetupScreen';

const NAV: { screen: Screen; label: string }[] = [
  { screen: 'session', label: 'Người chơi' },
  { screen: 'setup', label: 'Chuẩn bị ván' },
  { screen: 'live', label: 'Đang chơi' },
  { screen: 'history', label: 'Lịch sử' },
  { screen: 'calibrate', label: 'Calibrate' },
  { screen: 'checklist', label: 'Thiết bị' },
  { screen: 'analyze', label: 'Phân tích video' },
];

export function App() {
  const model = useModel();
  const state = useAppState();
  if (!state.ready) return <div class="screen center muted">Đang tải…</div>;

  const live = state.live.match !== null;
  return (
    <div class="app">
      <nav class="nav">
        <span class="brand">🏸 Badminton Tracker</span>
        {NAV.map(({ screen, label }) => (
          <button
            key={screen}
            class={`nav-item ${state.screen === screen ? 'active' : ''}`}
            disabled={!state.session && screen !== 'session' && screen !== 'calibrate' && screen !== 'checklist' && screen !== 'analyze'}
            onClick={() => model.navigate(screen)}
          >
            {label}
            {screen === 'live' && live && <span class="live-dot" />}
          </button>
        ))}
      </nav>
      {state.error && (
        <div class="error-bar" role="alert">
          {state.error}
          <button onClick={() => model.dismissError()}>Đóng</button>
        </div>
      )}
      <main>
        {state.screen === 'session' && <SessionScreen />}
        {state.screen === 'setup' && (live ? <LiveScreen /> : <SetupScreen />)}
        {state.screen === 'live' && <LiveScreen />}
        {state.screen === 'history' && <HistoryScreen />}
        {state.screen === 'calibrate' && <CalibrateScreen />}
        {state.screen === 'checklist' && <DevicesScreen />}
        {state.screen === 'analyze' && <AnalyzeScreen />}
      </main>
    </div>
  );
}
