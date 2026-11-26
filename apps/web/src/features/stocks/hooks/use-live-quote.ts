'use client';

import { useEffect, useState } from 'react';
import { subscribeQuote, type LiveState } from './quote-subscription';

export function useLiveQuote(code: string, enabled: boolean) {
  const [state, setState] = useState<LiveState>();
  useEffect(() => {
    if (enabled) return subscribeQuote(code, setState);
  }, [code, enabled]);
  return enabled && state?.code === code ? state : undefined;
}
