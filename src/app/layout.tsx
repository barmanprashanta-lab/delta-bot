import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Delta Scalper · Claude-driven',
  description: 'Autonomous BTC scalping bot — Claude decides, the bot executes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
