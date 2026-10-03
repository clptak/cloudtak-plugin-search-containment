import { onBeforeUnmount, ref } from 'vue';
import { WisarError, problemMessage, type Job, type WisarClient } from './wisar.ts';

export type WisarJobPhase = 'idle' | 'submitting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'error' | 'cancelled';

/**
 * Submit one WiSAR job and follow it to the end: queue position, running
 * time, and the finished job (or why it failed). Leaving the panel stops the
 * polling; a job already running keeps running on WiSAR.
 *
 * Adapted from Incident Manager's src/composables/useWisarJob.ts: the client
 * comes from the caller (SC has no settings composable), reset() clears it
 * for a new source, and a superseded run never overwrites newer state.
 */
export function useWisarJob(getClient: () => WisarClient) {
    const job = ref<Job | null>(null);
    const phase = ref<WisarJobPhase>('idle');
    const error = ref('');
    const startedAt = ref(0);
    const now = ref(Date.now());

    let controller: AbortController | null = null;
    let ticker: ReturnType<typeof setInterval> | null = null;
    let active: WisarClient | null = null;

    function stopTicker(): void {
        if (ticker) clearInterval(ticker);
        ticker = null;
    }

    async function run(submit: (c: WisarClient, signal: AbortSignal) => Promise<Job>): Promise<Job | null> {
        controller?.abort();
        const mine = new AbortController();
        controller = mine;
        const current = (): boolean => controller === mine;
        const { signal } = mine;

        active = getClient();
        const client = active;
        job.value = null;
        error.value = '';
        phase.value = 'submitting';
        startedAt.value = Date.now();
        now.value = startedAt.value;
        stopTicker();
        ticker = setInterval(() => { now.value = Date.now(); }, 1000);

        const track = (j: Job): void => {
            if (!current()) return;
            job.value = j;
            if (j.status === 'queued' || j.status === 'running') phase.value = j.status;
        };

        try {
            const submitted = await submit(client, signal);
            track(submitted);
            const final = await client.waitForJob(submitted, { signal, onUpdate: track });
            if (!current()) return null;
            job.value = final;
            if (final.status === 'succeeded') {
                phase.value = 'succeeded';
            } else {
                phase.value = 'failed';
                error.value = problemMessage(final.error, 'The analysis failed on WiSAR.');
            }
            return final;
        } catch (err) {
            if (!current()) return null;
            if (err instanceof Error && err.name === 'AbortError') {
                phase.value = 'cancelled';
            } else {
                phase.value = 'error';
                error.value = err instanceof WisarError || err instanceof Error ? err.message : String(err);
            }
            return null;
        } finally {
            if (current()) {
                now.value = Date.now();
                stopTicker();
            }
        }
    }

    /** Stop waiting. A job still in the queue is removed; a running one finishes on WiSAR. */
    async function cancel(): Promise<void> {
        const queued = job.value?.status === 'queued' ? job.value.id : null;
        const client = active;
        controller?.abort();
        if (queued && client) {
            try {
                await client.deleteJob(queued);
            } catch {
                // already started or gone; nothing to undo
            }
        }
    }

    /** Cancel anything in flight and go back to idle (e.g. a new starting point). */
    function reset(): void {
        void cancel();
        controller = null;
        stopTicker();
        job.value = null;
        error.value = '';
        phase.value = 'idle';
    }

    /** The client the last job ran on, for fetching its outputs. */
    function client(): WisarClient | null {
        return active;
    }

    onBeforeUnmount(() => {
        controller?.abort();
        stopTicker();
    });

    return { job, phase, error, startedAt, now, run, cancel, reset, client };
}
