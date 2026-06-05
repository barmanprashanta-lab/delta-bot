'use client';

import { BotStatus } from '@/types';

interface ControlPanelProps {
  status: BotStatus;
  mode: 'PAPER' | 'LIVE';
  onCommand: (command: 'start' | 'pause' | 'stop') => void;
}

export function ControlPanel({ status, mode, onCommand }: ControlPanelProps): JSX.Element {
  const running = status === 'RUNNING';
  return (
    <div className="control-panel">
      <button
        type="button"
        className="ctrl ctrl-start"
        disabled={running}
        onClick={() => onCommand('start')}
      >
        {mode === 'LIVE' ? 'Start (LIVE)' : 'Start (Paper)'}
      </button>
      <button
        type="button"
        className="ctrl ctrl-pause"
        disabled={!running}
        onClick={() => onCommand('pause')}
      >
        Pause
      </button>
      <button
        type="button"
        className="ctrl ctrl-stop"
        onClick={() => onCommand('stop')}
      >
        Stop
      </button>
    </div>
  );
}
