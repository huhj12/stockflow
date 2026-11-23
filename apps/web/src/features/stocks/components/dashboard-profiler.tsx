'use client';

import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';

const record: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  // Only the opt-in profiling build mounts this boundary; no telemetry is sent.
  window.dispatchEvent(
    new CustomEvent('stockflow:profile', {
      detail: {
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      },
    }),
  );
};

export function DashboardProfiler({ children }: { children: ReactNode }) {
  return (
    <Profiler id="stock-dashboard" onRender={record}>
      {children}
    </Profiler>
  );
}
