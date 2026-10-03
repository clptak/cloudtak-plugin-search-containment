<template>
    <div
        v-if='phase !== "idle"'
        class='small'
        role='status'
    >
        <span v-if='phase === "submitting"'>Sending to WiSAR…</span>
        <span v-else-if='phase === "queued"'>
            Queued at WiSAR<span v-if='job?.queue_position'> — position {{ job.queue_position }}</span> · {{ elapsed }}
        </span>
        <span v-else-if='phase === "running"'>
            Running on WiSAR · {{ elapsed }} (typically one to a few minutes)
        </span>
        <span
            v-else-if='phase === "succeeded"'
            class='text-success'
        >
            Done in {{ elapsed }} — {{ job?.result?.contour_count ?? 0 }} contour(s).
        </span>
        <span
            v-else-if='phase === "cancelled"'
            class='text-secondary'
        >Cancelled.</span>
        <span
            v-else
            class='text-danger'
        >{{ error }}</span>
    </div>
</template>

<script setup lang='ts'>
// Adapted from Incident Manager's src/components/wisar/WisarJobStatus.vue
import { computed } from 'vue';
import type { WisarJobPhase } from './useWisarJob.ts';
import type { Job } from './wisar.ts';
import { formatElapsed } from './wisarTravelTime.ts';

const props = defineProps<{
    phase: WisarJobPhase;
    job: Job | null;
    error: string;
    startedAt: number;
    now: number;
}>();

const elapsed = computed(() => formatElapsed(props.now - props.startedAt));
</script>
