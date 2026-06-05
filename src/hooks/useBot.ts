'use client';

import { useState, useEffect, useCallback } from 'react';
import { BotState, BotConfig } from '@/types';

interface BotApiResponse {
  state: BotState;
  config: BotConfig;
  error?: string;
}

interface UseBotResult {
  state: BotState | null;
  config: BotConfig | null;
  error: string | null;
  loading: boolean;
  sendCommand: (command: 'start' | 'pause' | 'stop') => Promise<void>;
}

const POLL_MS = 2000;

export function useBot(): UseBotResult {
  const [state, setState] = useState<BotState | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/bot', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
      const data = (await res.json()) as BotApiResponse;
      setState(data.state);
      setConfig(data.config);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const sendCommand = useCallback(
    async (command: 'start' | 'pause' | 'stop'): Promise<void> => {
      try {
        const res = await fetch('/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const data = (await res.json()) as BotApiResponse;
        if (!res.ok) throw new Error(data.error ?? 'Command failed');
        setState(data.state);
        setConfig(data.config);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Command failed');
      }
    },
    []
  );

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, config, error, loading, sendCommand };
}
