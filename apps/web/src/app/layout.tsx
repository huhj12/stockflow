import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '../providers/query-provider';
import './globals.css';
export const metadata: Metadata = {
  title: 'StockFlow',
  description: '국내 주식 모니터링 포트폴리오',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
