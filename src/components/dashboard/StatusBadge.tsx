'use client';

import { BotStatus } from '@/types';

interface StatusBadgeProps {
  status: BotStatus;
  mode: 'PAPER' | 'LIVE';
}

const STATUS_LABEL: Record<BotStatus, string> = {
  RUNNING: 'Live Loop',
  PAUSED: 'Paused',
  STOPPED: 'Stopped',
  ERROR: 'Error',
};

export function StatusBadge({ status, mode }: StatusBadgeProps): JSX.Element {
  return (
    <div className="status-cluster">
      <span className={`mode-pill mode-${mode.toLowerCase()}`}>{mode}</span>
      <span className={`status-pill status-${status.toLowerCase()}`}>
        <span className="status-dot" />
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
