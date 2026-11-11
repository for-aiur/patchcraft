/** A worker heartbeat does not depend on compositor animation callbacks.
 * Browsers/OSes may still suspend it; consumers must verify frame freshness.
 */
export function startFrameClock(tick: () => void): () => void {
  const clock = new Worker(new URL('./frame-clock-worker.ts', import.meta.url), { type: 'module' });
  clock.onmessage = () => { try { tick(); } finally { clock.postMessage('ack'); } };
  return () => clock.terminate();
}
