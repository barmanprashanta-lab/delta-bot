import { NextRequest, NextResponse } from 'next/server';
import { getBot } from '@/lib/config';

type Command = 'start' | 'pause' | 'stop';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { command?: Command };
    const bot = getBot();

    switch (body.command) {
      case 'start':
        if (bot.getConfig().mode === 'LIVE') {
          // Extra guard: require explicit confirmation header for live trading.
          if (req.headers.get('x-confirm-live') !== 'true') {
            return NextResponse.json(
              { error: 'LIVE mode requires x-confirm-live: true header' },
              { status: 403 }
            );
          }
        }
        bot.start();
        break;
      case 'pause':
        bot.pause();
        break;
      case 'stop':
        bot.stop();
        break;
      default:
        return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
    }

    return NextResponse.json({ state: bot.getState(), config: bot.getConfig() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const bot = getBot();
    return NextResponse.json({ state: bot.getState(), config: bot.getConfig() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
