import { AiUnavailableError } from './ai-provider.js';

/**
 * One hard deadline for a whole provider call. The SDKs retry 429s and 5xx
 * on their own, sleeping between tries; the signal stops the request in
 * flight, and the race stops the wait even while an SDK sleeps. The losing
 * promise still settles later; nobody is listening.
 */
export async function withDeadline<T>(
  timeoutMs: number,
  start: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const call = start(deadline);
  const timedOut = new Promise<never>((_, reject) => {
    deadline.addEventListener(
      'abort',
      () => {
        reject(new AiUnavailableError('Timeout'));
      },
      { once: true },
    );
  });
  try {
    return await Promise.race([call, timedOut]);
  } catch (error) {
    void call.catch(() => undefined);
    throw error;
  }
}
