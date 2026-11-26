'use client';

import { useEffect, useRef, useState } from 'react';
import {
  subscribeQuote,
  type LiveState,
} from '../stocks/hooks/quote-subscription';

export function usePortfolioQuotes(codes: string[]) {
  const key = [...new Set(codes)].sort().join(',');
  const connections = useRef(new Map<string, () => void>());
  const latest = useRef(new Map<string, LiveState>());
  const [quotes, setQuotes] = useState<Record<string, LiveState>>({});
  useEffect(() => {
    const wanted = new Set(key ? key.split(',') : []);
    for (const [code, stop] of connections.current) {
      if (!wanted.has(code)) {
        stop();
        connections.current.delete(code);
        latest.current.delete(code);
      }
    }
    for (const code of wanted) {
      if (!connections.current.has(code)) {
        connections.current.set(
          code,
          subscribeQuote(code, (state) => {
            latest.current.set(code, state);
            setQuotes(Object.fromEntries(latest.current));
          }),
        );
      }
    }
  }, [key]);
  useEffect(() => {
    const active = connections.current;
    const messages = latest.current;
    return () => {
      for (const stop of active.values()) stop();
      active.clear();
      messages.clear();
    };
  }, []);
  // Ignore removed positions immediately, even before their effect cleanup runs.
  return Object.fromEntries(codes.map((code) => [code, quotes[code]]));
}
