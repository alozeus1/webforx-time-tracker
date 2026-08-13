/**
 * Protocol-only foundation for a future offline timer mutation queue.
 *
 * It is intentionally disabled by default and is not wired into the API client. A safe
 * rollout also requires backend idempotency keys, per-user ordering, server revision
 * preconditions, authentication-expiry handling, and explicit conflict resolution.
 */
export const OFFLINE_TIMER_QUEUE_ENABLED = import.meta.env.VITE_OFFLINE_TIMER_QUEUE_ENABLED === 'true';

export type OfflineTimerOperation = 'start' | 'pause' | 'resume' | 'stop';

export interface OfflineTimerMutation {
    idempotencyKey: string;
    operation: OfflineTimerOperation;
    createdAt: string;
    expectedServerRevision: string;
    payload: Record<string, unknown>;
}

export const queueOfflineTimerMutation = async (_mutation: OfflineTimerMutation): Promise<never> => {
    void _mutation;
    if (!OFFLINE_TIMER_QUEUE_ENABLED) {
        throw new Error('Offline timer queue is disabled; timer changes require a network connection.');
    }

    throw new Error('Offline timer queue protocol is not implemented.');
};
