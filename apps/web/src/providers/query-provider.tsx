'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
export function QueryProvider({ children }: { children: ReactNode }) {
  // Each app mount owns its cache, avoiding cross-request server state sharing.
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
