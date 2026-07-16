<template>
    <MenuTemplate name='Search Containment'>
        <template #buttons>
            <TablerRefreshButton
                :loading='loading'
                @click='reload'
            />
        </template>
        <template #default>
            <TablerLoading
                v-if='loading'
                desc='Loading'
            />

            <!-- No active DataSync mission -->
            <TablerNone
                v-else-if='!mission'
                :create='false'
                label='Active DataSync'
            >
                <template #actions>
                    <div class='col-12 px-3 py-2 text-center text-secondary'>
                        Subscribe to a Data Sync mission and make it active
                        (Menu &rarr; Data Sync), then return here.
                    </div>
                </template>
            </TablerNone>

            <!-- No snapping tileset on the server -->
            <TablerNone
                v-else-if='basemaps.length === 0'
                :create='false'
                label='Snapping Tileset'
            >
                <template #actions>
                    <div class='col-12 px-3 py-2 text-center text-secondary'>
                        No snapping-enabled basemap (e.g. snapping.pmtiles) is
                        configured on this server. An administrator must enable
                        snapping on a hosted vector basemap.
                    </div>
                </template>
            </TablerNone>

            <!-- Step 1: pick the source feature -->
            <template v-else-if='stage === "pick"'>
                <div class='col-12 px-2 py-2 text-secondary small'>
                    Select a shape or marker from
                    <span
                        class='fw-bold'
                        v-text='missionName'
                    />
                    to build the containment ring around.
                </div>

                <TablerNone
                    v-if='sources.length === 0'
                    :create='false'
                    label='Eligible Features'
                >
                    <template #actions>
                        <div class='col-12 px-3 py-2 text-center text-secondary'>
                            The active mission has no markers, polygons or
                            circles to build a ring from.
                        </div>
                    </template>
                </TablerNone>

                <div
                    v-else
                    class='col-12 d-flex flex-column gap-2 px-2 py-2'
                >
                    <StandardItem
                        v-for='feat of sources'
                        :key='String(feat.id)'
                        class='d-flex align-items-center gap-3 p-2 cursor-pointer'
                        @click='selectSource(feat)'
                    >
                        <div
                            class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                            style='width: 2.5rem; height: 2.5rem; min-width: 2.5rem;'
                        >
                            <IconMapPin
                                v-if='feat.geometry.type === "Point"'
                                :size='20'
                                stroke='1'
                            />
                            <IconPolygon
                                v-else
                                :size='20'
                                stroke='1'
                            />
                        </div>
                        <div
                            class='d-flex flex-column'
                            style='min-width: 0'
                        >
                            <div
                                class='fw-bold text-truncate'
                                v-text='String(feat.properties.callsign || "Unnamed")'
                            />
                            <div
                                class='text-secondary small'
                                v-text='feat.geometry.type === "Point" ? "Marker" : "Shape"'
                            />
                        </div>
                    </StandardItem>
                </div>
            </template>

            <!-- Step 2: configure & generate -->
            <template v-else-if='stage === "configure" && selected'>
                <div class='col-12 px-2 py-2'>
                    <StandardItem class='d-flex align-items-center gap-3 p-2'>
                        <div
                            class='d-flex flex-column'
                            style='min-width: 0'
                        >
                            <div
                                class='fw-bold text-truncate'
                                v-text='String(selected.properties.callsign || "Unnamed")'
                            />
                            <div
                                class='text-secondary small'
                                v-text='selected.geometry.type === "Point"
                                    ? "Range ring around marker"
                                    : "Ring offset outward from boundary"'
                            />
                        </div>
                        <div class='ms-auto'>
                            <button
                                class='btn btn-sm'
                                @click='backToPick'
                            >
                                Change
                            </button>
                        </div>
                    </StandardItem>

                    <div class='row g-2 pt-3'>
                        <div class='col-7'>
                            <label class='form-label'>Distance</label>
                            <input
                                v-model.number='config.distance'
                                type='number'
                                min='0'
                                step='any'
                                class='form-control'
                            >
                        </div>
                        <div class='col-5'>
                            <label class='form-label'>Units</label>
                            <select
                                v-model='config.unit'
                                class='form-select'
                            >
                                <option value='miles'>
                                    Miles
                                </option>
                                <option value='meters'>
                                    Meters
                                </option>
                            </select>
                        </div>

                        <div class='col-7'>
                            <label class='form-label'>Merge points within (m)</label>
                            <input
                                v-model.number='config.spacing'
                                type='number'
                                min='0'
                                step='1'
                                class='form-control'
                            >
                        </div>
                        <div class='col-5'>
                            <label class='form-label'>Color</label>
                            <input
                                v-model='config.color'
                                type='color'
                                class='form-control form-control-color w-100'
                            >
                        </div>

                        <div
                            v-if='basemaps.length > 1'
                            class='col-12'
                        >
                            <label class='form-label'>Trail Network</label>
                            <select
                                v-model='config.basemap'
                                class='form-select'
                            >
                                <option
                                    v-for='bm of basemaps'
                                    :key='bm.id'
                                    :value='bm.name'
                                    v-text='bm.name'
                                />
                            </select>
                        </div>
                    </div>

                    <div
                        v-if='error'
                        class='alert alert-danger my-3'
                        v-text='error'
                    />

                    <div class='d-flex pt-3'>
                        <button
                            class='btn'
                            @click='backToPick'
                        >
                            Back
                        </button>
                        <button
                            class='btn btn-primary ms-auto'
                            :disabled='generating || !distanceValid'
                            @click='generate'
                        >
                            <span
                                v-if='generating'
                                class='spinner-border spinner-border-sm me-2'
                            />
                            Generate
                        </button>
                    </div>
                </div>
            </template>

            <!-- Step 3: preview & confirm -->
            <template v-else-if='stage === "preview"'>
                <div class='col-12 px-2 py-2'>
                    <div
                        v-if='points.length'
                        class='alert alert-info'
                    >
                        <span
                            class='fw-bold'
                            v-text='points.length'
                        />
                        containment point{{ points.length === 1 ? '' : 's' }} found
                        where trails cross the ring &mdash; previewed on the map as
                        <span class='fw-bold'>Containment {{ startNumber }}</span>
                        through
                        <span class='fw-bold'>Containment {{ startNumber + points.length - 1 }}</span>.
                    </div>
                    <div
                        v-else
                        class='alert alert-warning'
                    >
                        No trail crossings were found on the ring. You can still
                        post the ring itself, or go back and adjust the distance.
                    </div>

                    <div
                        v-if='error'
                        class='alert alert-danger'
                        v-text='error'
                    />

                    <div class='d-flex pt-2'>
                        <button
                            class='btn'
                            :disabled='posting'
                            @click='cancelPreview'
                        >
                            Back
                        </button>
                        <button
                            class='btn btn-primary ms-auto'
                            :disabled='posting'
                            @click='confirm'
                        >
                            <span
                                v-if='posting'
                                class='spinner-border spinner-border-sm me-2'
                            />
                            Post to Mission
                        </button>
                    </div>
                </div>
            </template>

            <!-- Step 4: done -->
            <template v-else-if='stage === "done"'>
                <div class='col-12 px-2 py-2'>
                    <div class='alert alert-success'>
                        Posted <span
                            class='fw-bold'
                            v-text='postedCount'
                        />
                        containment marker{{ postedCount === 1 ? '' : 's' }} and the
                        containment ring to
                        <span
                            class='fw-bold'
                            v-text='missionName'
                        />.
                    </div>
                    <div class='d-flex pt-2'>
                        <button
                            class='btn btn-primary ms-auto'
                            @click='reset'
                        >
                            Run Again
                        </button>
                    </div>
                </div>
            </template>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import MenuTemplate from '../../../src/components/CloudTAK/util/MenuTemplate.vue';
import StandardItem from '../../../src/components/CloudTAK/util/StandardItem.vue';
import {
    TablerNone,
    TablerLoading,
    TablerRefreshButton
} from '@tak-ps/vue-tabler';
import {
    IconMapPin,
    IconPolygon
} from '@tabler/icons-vue';
import { useMapStore } from '../../../src/stores/map.ts';
import KV from '../../../src/base/kv.ts';
import type { Feature } from '../../../src/types.ts';
import type { Position } from 'geojson';
import {
    toKilometers,
    buildRings,
    ringTrailIntersections,
    clusterPoints,
    sortClockwise,
    type DistanceUnit
} from './geometry.ts';
import {
    listSnappingBasemaps,
    fetchTrailsAlongRings,
    type SnappingBasemap
} from './trails.ts';
import {
    CONTAINMENT_RE,
    nextContainmentNumber,
    buildContainmentMarker,
    buildRingFeature
} from './markers.ts';

const SETTINGS_KEY = 'search-containment:settings';
const PREVIEW_SOURCE = 'search-containment-preview';
const PREVIEW_LINE = 'search-containment-preview-line';
const PREVIEW_POINTS = 'search-containment-preview-points';

const mapStore = useMapStore();

const loading = ref(true);
const generating = ref(false);
const posting = ref(false);
const error = ref('');

const stage = ref<'pick' | 'configure' | 'preview' | 'done'>('pick');

const basemaps = ref<SnappingBasemap[]>([]);
const sources = ref<Feature[]>([]);
const selected = ref<Feature | undefined>();

const rings = ref<Position[][]>([]);
const points = ref<Position[]>([]);
const startNumber = ref(1);
const postedCount = ref(0);

const config = ref({
    distance: 1,
    unit: 'miles' as DistanceUnit,
    spacing: 50,
    color: '#d63939',
    basemap: ''
});

const mission = computed(() => mapStore.mission);
const missionName = computed(() => mapStore.mission ? mapStore.mission.meta.name : '');

const distanceValid = computed(() => {
    if (typeof config.value.distance !== 'number' || isNaN(config.value.distance)) return false;
    if (selected.value && selected.value.geometry.type === 'Point') return config.value.distance > 0;
    return config.value.distance >= 0;
});

onMounted(async () => {
    await restoreSettings();
    await reload();
});

onBeforeUnmount(() => {
    removePreview();
});

async function reload(): Promise<void> {
    loading.value = true;
    error.value = '';

    try {
        basemaps.value = await listSnappingBasemaps();

        if (basemaps.value.length && !basemaps.value.some((b) => b.name === config.value.basemap)) {
            config.value.basemap = basemaps.value[0].name;
        }

        await loadSources();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

async function loadSources(): Promise<void> {
    if (!mapStore.mission) {
        sources.value = [];
        return;
    }

    const feats = await mapStore.mission.feature.list();

    sources.value = feats.filter((feat) => {
        if (!['Point', 'Polygon', 'MultiPolygon'].includes(feat.geometry.type)) return false;

        // Don't offer previously generated containment markers as sources
        const callsign = typeof feat.properties.callsign === 'string' ? feat.properties.callsign.trim() : '';
        if (CONTAINMENT_RE.test(callsign)) return false;

        return true;
    });
}

function selectSource(feat: Feature): void {
    selected.value = feat;
    error.value = '';
    stage.value = 'configure';
}

function backToPick(): void {
    removePreview();
    selected.value = undefined;
    error.value = '';
    stage.value = 'pick';
}

async function generate(): Promise<void> {
    if (!selected.value || !mapStore.mission) return;

    generating.value = true;
    error.value = '';

    try {
        const basemap = basemaps.value.find((b) => b.name === config.value.basemap);
        if (!basemap) throw new Error('No trail network selected');

        const distanceKm = toKilometers(config.value.distance, config.value.unit);

        rings.value = buildRings(selected.value.geometry, distanceKm);

        const trails = await fetchTrailsAlongRings(basemap, rings.value);

        const raw = ringTrailIntersections(rings.value, trails);
        const clustered = clusterPoints(raw, config.value.spacing);

        points.value = sortClockwise(clustered);

        startNumber.value = nextContainmentNumber(await mapStore.mission.feature.list());

        await saveSettings();

        drawPreview();
        stage.value = 'preview';
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        generating.value = false;
    }
}

function cancelPreview(): void {
    removePreview();
    error.value = '';
    stage.value = 'configure';
}

async function confirm(): Promise<void> {
    if (!mapStore.mission) return;

    posting.value = true;
    error.value = '';

    try {
        // Re-check numbering at post time in case the mission changed
        startNumber.value = nextContainmentNumber(await mapStore.mission.feature.list());

        const sourceName = selected.value && typeof selected.value.properties.callsign === 'string'
            ? selected.value.properties.callsign.trim()
            : '';

        for (let i = 0; i < rings.value.length; i++) {
            const callsign = (sourceName ? sourceName + ' ' : '')
                + 'Containment Ring'
                + (rings.value.length > 1 ? ` ${i + 1}` : '');

            await mapStore.worker.db.add(
                buildRingFeature(rings.value[i], callsign, config.value.color),
                { authored: true }
            );
        }

        for (let i = 0; i < points.value.length; i++) {
            await mapStore.worker.db.add(
                buildContainmentMarker(points.value[i], startNumber.value + i, config.value.color),
                { authored: true }
            );
        }

        await mapStore.refresh();

        postedCount.value = points.value.length;
        removePreview();
        stage.value = 'done';
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        posting.value = false;
    }
}

function reset(): void {
    removePreview();
    selected.value = undefined;
    rings.value = [];
    points.value = [];
    postedCount.value = 0;
    error.value = '';
    stage.value = 'pick';

    loadSources().catch((err) => {
        error.value = err instanceof Error ? err.message : String(err);
    });
}

function drawPreview(): void {
    const map = mapStore.map;
    if (!map) return;

    removePreview();

    const collection = {
        type: 'FeatureCollection' as const,
        features: [
            ...rings.value.map((ring) => ({
                type: 'Feature' as const,
                properties: { role: 'ring' },
                geometry: {
                    type: 'LineString' as const,
                    coordinates: ring
                }
            })),
            ...points.value.map((point, i) => ({
                type: 'Feature' as const,
                properties: { role: 'point', label: String(startNumber.value + i) },
                geometry: {
                    type: 'Point' as const,
                    coordinates: point
                }
            }))
        ]
    };

    map.addSource(PREVIEW_SOURCE, {
        type: 'geojson',
        data: collection
    });

    map.addLayer({
        id: PREVIEW_LINE,
        type: 'line',
        source: PREVIEW_SOURCE,
        filter: ['==', ['get', 'role'], 'ring'],
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': config.value.color,
            'line-width': 3,
            'line-dasharray': [2, 2],
            'line-opacity': 0.9
        }
    });

    map.addLayer({
        id: PREVIEW_POINTS,
        type: 'circle',
        source: PREVIEW_SOURCE,
        filter: ['==', ['get', 'role'], 'point'],
        paint: {
            'circle-radius': 7,
            'circle-color': config.value.color,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
        }
    });

    // Fit the map to the ring
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings.value) {
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (minX !== Infinity) {
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 80, duration: 500 });
    }
}

function removePreview(): void {
    const map = mapStore.map;
    if (!map) return;

    for (const layer of [PREVIEW_LINE, PREVIEW_POINTS]) {
        if (map.getLayer(layer)) map.removeLayer(layer);
    }
    if (map.getSource(PREVIEW_SOURCE)) map.removeSource(PREVIEW_SOURCE);
}

async function restoreSettings(): Promise<void> {
    try {
        const raw = await KV.value(SETTINGS_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw) as Partial<typeof config.value>;

        if (typeof saved.distance === 'number') config.value.distance = saved.distance;
        if (saved.unit === 'miles' || saved.unit === 'meters') config.value.unit = saved.unit;
        if (typeof saved.spacing === 'number') config.value.spacing = saved.spacing;
        if (typeof saved.color === 'string') config.value.color = saved.color;
        if (typeof saved.basemap === 'string') config.value.basemap = saved.basemap;
    } catch (err) {
        console.error('Search Containment: failed to restore settings', err);
    }
}

async function saveSettings(): Promise<void> {
    try {
        await KV.update(SETTINGS_KEY, JSON.stringify({
            distance: config.value.distance,
            unit: config.value.unit,
            spacing: config.value.spacing,
            color: config.value.color,
            basemap: config.value.basemap
        }));
    } catch (err) {
        console.error('Search Containment: failed to save settings', err);
    }
}
</script>
