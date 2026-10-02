<template>
    <MenuTemplate name='Search Containment'>
        <template #header>
            <IconBarrierBlock
                :size='24'
                stroke='1'
                class='ms-2 flex-shrink-0'
            />
            <span class='strong user-select-none text-break px-2'>Search Containment</span>
        </template>
        <template #buttons>
            <TablerIconButton
                title='Usage'
                @click='showHelp = true'
            >
                <IconInfoCircle
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
            <TablerRefreshButton
                :loading='loading'
                @click='reload'
            />
        </template>
        <template #default>
            <div class='plugin-pane px-3 py-3'>
                <TablerLoading
                    v-if='loading'
                    desc='Loading'
                />

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
                    <TablerInlineAlert
                        v-if='!mission'
                        class='mb-2'
                        severity='info'
                        title='No Active DataSync'
                        description='Use a Manual Point below. You can generate and preview without a DataSync; posting needs one to be active (Menu → Data Sync).'
                    />
                    <div
                        v-else
                        class='col-12 py-2 text-secondary small'
                    >
                        Select a shape or line from
                        <span
                            class='fw-bold'
                            v-text='missionName'
                        />
                        to find trail crossings for, or use a Manual Point below.
                    </div>

                    <TablerNone
                        v-if='mission && sources.length === 0'
                        :create='false'
                        label='Eligible Features'
                    >
                        <template #actions>
                            <div class='col-12 px-3 py-2 text-center text-secondary'>
                                The active mission has no polygons, circles or
                                lines to work from — use a Manual Point below.
                            </div>
                        </template>
                    </TablerNone>

                    <div
                        v-else
                        class='col-12 d-flex flex-column gap-2 py-2'
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
                                <IconLine
                                    v-if='isLineGeometry(feat)'
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
                                    v-text='isLineGeometry(feat) ? "Line" : "Shape"'
                                />
                            </div>
                        </StandardItem>
                    </div>

                    <!-- Manual point entry (collapsed by default) -->
                    <div class='col-12 pb-2'>
                        <TablerBorder
                            class='cloudtak-bg text-white'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <div
                                    class='d-flex align-items-center gap-2 w-100 cursor-pointer user-select-none'
                                    role='button'
                                    tabindex='0'
                                    @click='toggleManual'
                                    @keydown.enter='toggleManual'
                                >
                                    <IconChevronDown
                                        v-if='manualOpen'
                                        :size='20'
                                        stroke='1'
                                    />
                                    <IconChevronRight
                                        v-else
                                        :size='20'
                                        stroke='1'
                                    />
                                    <p class='text-uppercase text-white-50 small mb-0'>
                                        Manual Point
                                    </p>
                                    <span class='text-secondary small ms-auto normal-case'>
                                        Custom location &amp; ring
                                    </span>
                                </div>
                            </template>

                            <template v-if='manualOpen'>
                                <TablerInput
                                    v-model='manualName'
                                    label='Name'
                                    placeholder='Manual Point'
                                />

                                <Coordinate
                                    v-model='manualCoords'
                                    label='Location'
                                    :edit='true'
                                    :hover='true'
                                />

                                <div class='d-flex gap-2 pt-3'>
                                    <button
                                        type='button'
                                        class='btn'
                                        :class='picking ? "btn-primary" : "btn-secondary"'
                                        @click='togglePickFromMap'
                                    >
                                        <IconCrosshair
                                            :size='18'
                                            stroke='1'
                                            class='me-1'
                                        />
                                        {{ picking ? 'Click the map…' : 'Select on Map' }}
                                    </button>
                                    <button
                                        type='button'
                                        class='btn btn-primary ms-auto'
                                        @click='useManualPoint'
                                    >
                                        Use This Point
                                    </button>
                                </div>
                            </template>
                        </TablerBorder>
                    </div>
                </template>

                <!-- Step 2: configure & generate -->
                <template v-else-if='stage === "configure" && selected'>
                    <div class='col-12'>
                        <TablerBorder
                            class='cloudtak-bg text-white'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Source
                                </p>
                            </template>

                            <div class='d-flex align-items-center gap-3'>
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
                                        v-text='sourceModeLabel'
                                    />
                                </div>
                                <div class='ms-auto'>
                                    <button
                                        type='button'
                                        class='btn btn-sm btn-secondary'
                                        @click='backToPick'
                                    >
                                        Change
                                    </button>
                                </div>
                            </div>
                        </TablerBorder>

                        <TablerBorder
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Configure
                                </p>
                            </template>

                            <div class='row g-2'>
                                <div
                                    v-if='mode !== "check"'
                                    class='col-12'
                                >
                                    <div
                                        class='btn-group w-100'
                                        role='group'
                                        aria-label='Containment method'
                                    >
                                        <button
                                            type='button'
                                            class='btn'
                                            :class='method === "distance" ? "btn-primary" : "btn-secondary"'
                                            @click='method = "distance"'
                                        >
                                            Distance
                                        </button>
                                        <button
                                            type='button'
                                            class='btn'
                                            :class='method === "wisar" ? "btn-primary" : "btn-secondary"'
                                            :disabled='!wisarStart.ok'
                                            @click='method = "wisar"'
                                        >
                                            WiSAR Travel Time
                                        </button>
                                    </div>
                                    <div
                                        v-if='!wisarStart.ok && wisarStart.reason'
                                        class='text-secondary small pt-1'
                                        v-text='wisarStart.reason'
                                    />
                                </div>

                                <template v-if='mode !== "check" && method === "distance"'>
                                    <div class='col-7'>
                                        <TablerInput
                                            v-model.number='config.distance'
                                            type='number'
                                            label='Distance'
                                            :min='0'
                                            step='any'
                                        />
                                    </div>
                                    <div class='col-5'>
                                        <TablerEnum
                                            v-model='unitLabel'
                                            label='Units'
                                            :options='unitOptions'
                                        />
                                    </div>
                                </template>

                                <div
                                    v-if='mode !== "check" && method === "wisar"'
                                    class='col-12 d-flex flex-column gap-1'
                                >
                                    <div
                                        class='text-secondary small'
                                        v-text='wisarStartLabel'
                                    />
                                    <div class='text-secondary small'>
                                        WiSAR server:
                                        <span
                                            class='fw-bold'
                                            v-text='wisarServer.url'
                                        />
                                        <span v-text='wisarServerSourceLabel' />
                                    </div>
                                    <div
                                        v-if='wisarStatusText'
                                        class='small'
                                        :class='wisarStatusClass'
                                        v-text='wisarStatusText'
                                    />
                                    <div class='text-secondary small'>
                                        Travel Time settings (speed and up to 3 intervals) and the WiSAR run come in the next build step.
                                    </div>
                                </div>

                                <div class='col-7'>
                                    <TablerInput
                                        v-model.number='config.spacing'
                                        type='number'
                                        label='Merge Points Within (m)'
                                        :min='0'
                                        step='1'
                                    />
                                </div>
                                <div class='col-5'>
                                    <TablerInput
                                        v-model='config.color'
                                        type='color'
                                        label='Color'
                                    />
                                </div>

                                <div
                                    v-if='basemaps.length > 1'
                                    class='col-12'
                                >
                                    <TablerEnum
                                        v-model='config.basemap'
                                        label='Trail Network'
                                        :options='basemapOptions'
                                    />
                                </div>

                                <div class='col-12'>
                                    <TablerInput
                                        v-model='labelPrefixInput'
                                        label='Label Prefix'
                                        placeholder='Optional'
                                    />
                                    <div class='text-secondary small pt-1'>
                                        Leave blank for {{ blankMarkerExample }} in the Containment layer.
                                        A prefix such as North names markers North 1, North 2, and files them in North Containment.
                                    </div>
                                </div>
                            </div>
                        </TablerBorder>

                        <TablerInlineAlert
                            v-if='error'
                            class='my-3'
                            severity='danger'
                            title='Error'
                            :description='error'
                        />

                        <div class='d-flex pt-3'>
                            <button
                                type='button'
                                class='btn btn-secondary'
                                @click='backToPick'
                            >
                                Back
                            </button>
                            <button
                                type='button'
                                class='btn btn-primary ms-auto'
                                :disabled='generating || !canGenerate'
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
                    <div class='col-12'>
                        <TablerInlineAlert
                            v-if='previewMarkers.length'
                            severity='info'
                            title='Preview'
                            :description='previewInfoDescription'
                        />
                        <TablerInlineAlert
                            v-else-if='shouldPostRing'
                            severity='warning'
                            title='No Crossings'
                            description='No trail crossings were found on the ring. You can still post the ring itself, or go back and adjust the distance.'
                        />
                        <TablerInlineAlert
                            v-else
                            severity='warning'
                            title='No Crossings'
                            description='No trail crossings were found along the line. Go back and adjust the merge spacing or pick a different line.'
                        />

                        <TablerBorder
                            v-if='previewMarkers.length'
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Markers
                                </p>
                            </template>

                            <label class='d-flex align-items-center gap-2 mb-2 user-select-none'>
                                <input
                                    ref='selectAllBox'
                                    type='checkbox'
                                    class='form-check-input m-0'
                                    :checked='allMarkersIncluded'
                                    aria-label='Select all markers'
                                    @change='toggleAllMarkers'
                                >
                                <span class='small'>All</span>
                            </label>

                            <div
                                class='d-flex flex-column gap-1 overflow-auto'
                                style='max-height: 16rem'
                            >
                                <div
                                    v-for='(marker, index) in previewMarkers'
                                    :key='marker.callsign + "-" + index'
                                    class='d-flex align-items-center gap-2'
                                    style='min-width: 0'
                                >
                                    <input
                                        v-model='marker.included'
                                        type='checkbox'
                                        class='form-check-input m-0'
                                        :aria-label='"Post " + marker.callsign'
                                        @change='syncPreviewPoints'
                                    >
                                    <button
                                        type='button'
                                        class='btn btn-link marker-link flex-grow-1 p-0 text-start text-truncate'
                                        style='min-width: 0'
                                        @click='centerOnMarker(marker)'
                                    >
                                        {{ marker.callsign }}
                                    </button>
                                </div>
                            </div>
                        </TablerBorder>

                        <TablerInlineAlert
                            v-if='error'
                            class='mt-2'
                            severity='danger'
                            title='Error'
                            :description='error'
                        />

                        <div class='d-flex pt-3'>
                            <button
                                type='button'
                                class='btn btn-secondary'
                                :disabled='posting'
                                @click='cancelPreview'
                            >
                                Back
                            </button>
                            <button
                                type='button'
                                class='btn btn-primary ms-auto'
                                :disabled='!canPost'
                                @click='confirm'
                            >
                                <span
                                    v-if='posting'
                                    class='spinner-border spinner-border-sm me-2'
                                />
                                Post to Mission
                            </button>
                        </div>
                        <div
                            v-if='!mission'
                            class='text-secondary small pt-2 text-end'
                        >
                            Make a DataSync active (Menu &rarr; Data Sync) to post. The preview stays here, and
                            marker numbers update to follow that DataSync&rsquo;s existing markers.
                        </div>
                    </div>
                </template>

                <!-- Step 4: done -->
                <template v-else-if='stage === "done"'>
                    <div class='col-12'>
                        <TablerInlineAlert
                            severity='success'
                            title='Posted'
                            :description='doneDescription'
                        />
                        <div class='d-flex pt-3'>
                            <button
                                type='button'
                                class='btn btn-primary ms-auto'
                                @click='reset'
                            >
                                Run Again
                            </button>
                        </div>
                    </div>
                </template>

                <!-- Line usage choice modal -->
                <TablerModal
                    v-if='pendingLine'
                    size='sm'
                >
                    <div class='modal-status bg-blue' />
                    <button
                        type='button'
                        class='btn-close'
                        aria-label='Close'
                        @click='pendingLine = undefined'
                    />
                    <div class='modal-header text-body'>
                        <div class='d-flex flex-column'>
                            <div class='modal-title'>
                                Use Line As&hellip;
                            </div>
                            <div
                                class='text-secondary small'
                                v-text='String(pendingLine.properties.callsign || "Unnamed Line")'
                            />
                        </div>
                    </div>
                    <div class='modal-body text-body help-modal'>
                        <div class='d-flex flex-column gap-2'>
                            <TablerBorder
                                class='cloudtak-bg text-white cursor-pointer'
                                :fill-height='false'
                                :shadow='false'
                                gap='sm'
                                @click='chooseLineMode("containment")'
                            >
                                <div class='d-flex align-items-center gap-3'>
                                    <div
                                        class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                                        style='width: 2.5rem; height: 2.5rem; min-width: 2.5rem;'
                                    >
                                        <IconBarrierBlock
                                            :size='20'
                                            stroke='1'
                                        />
                                    </div>
                                    <div
                                        class='d-flex flex-column'
                                        style='min-width: 0'
                                    >
                                        <div class='fw-bold'>
                                            Containment
                                        </div>
                                        <div class='text-secondary small'>
                                            Offset a ring from the line by a distance
                                            (0 = the line itself) and mark trail
                                            crossings as Containment points
                                        </div>
                                    </div>
                                </div>
                            </TablerBorder>
                            <TablerBorder
                                class='cloudtak-bg text-white cursor-pointer'
                                :fill-height='false'
                                :shadow='false'
                                gap='sm'
                                @click='chooseLineMode("check")'
                            >
                                <div class='d-flex align-items-center gap-3'>
                                    <div
                                        class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                                        style='width: 2.5rem; height: 2.5rem; min-width: 2.5rem;'
                                    >
                                        <IconCrosshair
                                            :size='20'
                                            stroke='1'
                                        />
                                    </div>
                                    <div
                                        class='d-flex flex-column'
                                        style='min-width: 0'
                                    >
                                        <div class='fw-bold'>
                                            Location Check
                                        </div>
                                        <div class='text-secondary small'>
                                            Mark every point where this line crosses
                                            the trail network as "Check Location"
                                        </div>
                                    </div>
                                </div>
                            </TablerBorder>
                        </div>
                    </div>
                </TablerModal>

                <!-- Usage / help modal -->
                <TablerModal
                    v-if='showHelp'
                    size='lg'
                >
                    <div class='modal-status bg-blue' />
                    <button
                        type='button'
                        class='btn-close'
                        aria-label='Close'
                        @click='showHelp = false'
                    />
                    <div class='modal-header text-body'>
                        <IconBarrierBlock
                            :size='24'
                            stroke='1'
                            class='me-2'
                        />
                        <div class='modal-title'>
                            Search Containment &mdash; Usage
                        </div>
                    </div>
                    <div
                        class='modal-body text-body overflow-auto help-modal'
                        style='max-height: 65vh'
                    >
                        <TablerInlineAlert
                            severity='info'
                            title='Search Containment'
                            description='Pick a source — a mission shape, a mission line, or a manually entered point — and the plugin finds every place the trail network crosses the resulting boundary, plots numbered markers, and posts them into the active DataSync mission.'
                        />

                        <TablerBorder
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Pick A Source
                                </p>
                            </template>
                            <p class='mb-2'>
                                The list shows the active mission's polygons, circles and
                                lines. <span class='fw-bold'>Shapes</span> go straight to
                                configuration — the ring is the boundary offset outward
                                by the entered distance (0 uses the boundary as-is).
                                <span class='fw-bold'>Lines</span> ask what the line means.
                            </p>
                            <p class='mb-0'>
                                <span class='fw-bold'>Manual Point</span> (collapsed card at
                                the bottom of the picker) covers locations not in the
                                DataSync: type coordinates (DD / DMS / MGRS) or press
                                <span class='fw-bold'>Select on Map</span> and click the map,
                                then <span class='fw-bold'>Use This Point</span>. A manual
                                point gets a range ring at the entered distance.
                            </p>
                        </TablerBorder>

                        <TablerBorder
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Line Modes
                                </p>
                            </template>
                            <div class='d-flex flex-column gap-2'>
                                <div class='cloudtak-accent border rounded-3 text-white px-2 py-2'>
                                    <div class='fw-bold'>
                                        Containment
                                    </div>
                                    <div class='text-secondary small'>
                                        Distance offsets a corridor outward from the
                                        line (0 = the line itself); trail crossings
                                        are marked and the ring is posted with them.
                                        Labels: Containment {n}
                                    </div>
                                </div>
                                <div class='cloudtak-accent border rounded-3 text-white px-2 py-2'>
                                    <div class='fw-bold'>
                                        Location Check
                                    </div>
                                    <div class='text-secondary small'>
                                        The raw line is intersected with the trail
                                        network directly — no distance, no
                                        transform; only markers are posted.
                                        Labels: Check Location {n}
                                    </div>
                                </div>
                            </div>
                        </TablerBorder>

                        <TablerBorder
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Configure
                                </p>
                            </template>
                            <p class='mb-0'>
                                Distance + units (hidden for Location Check), merge spacing
                                (crossings closer than this merge into one marker, default
                                50&nbsp;m), color, trail network (when more than one
                                exists), and an optional label prefix. Leave the prefix
                                blank for Containment (or Check Location) numbering in the
                                Containment layer. A prefix such as North names markers
                                North 1, North 2, and files them in a layer named North
                                Containment. Settings other than the prefix persist per device.
                            </p>
                        </TablerBorder>

                        <TablerBorder
                            class='cloudtak-bg text-white mt-3'
                            :fill-height='false'
                            gap='sm'
                        >
                            <template #label>
                                <p class='text-uppercase text-white-50 small mb-0'>
                                    Preview And Post
                                </p>
                            </template>
                            <p class='mb-2'>
                                The proposed ring (dashed) and numbered points render on the
                                map without touching the mission. Each crossing is listed so
                                you can center the map on it and uncheck any marker you do
                                not want to post. Unchecked markers stay on the preview,
                                drawn lighter. Go back to adjust, or post.
                            </p>
                            <p class='mb-0'>
                                Checked markers — and the ring, when one was generated —
                                post to the active DataSync in the Containment layer, or in
                                &ldquo;{prefix} Containment&rdquo; when a prefix is set, and
                                sync to all subscribers. Numbers are assigned at Generate
                                from the highest existing matching label and are the names
                                that get posted. Location Check markers number in order
                                along the line; ring crossings number clockwise from north.
                            </p>
                        </TablerBorder>
                    </div>
                    <div class='modal-footer'>
                        <button
                            type='button'
                            class='btn btn-primary w-100'
                            @click='showHelp = false'
                        >
                            Close
                        </button>
                    </div>
                </TablerModal>
            </div>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import MenuTemplate from './MenuTemplate.vue';
import StandardItem from '../../../src/components/CloudTAK/util/StandardItem.vue';
import Coordinate from '../../../src/components/CloudTAK/util/Coordinate.vue';
import {
    TablerNone,
    TablerModal,
    TablerLoading,
    TablerIconButton,
    TablerRefreshButton,
    TablerBorder,
    TablerInput,
    TablerEnum,
    TablerInlineAlert
} from '@tak-ps/vue-tabler';
import {
    IconLine,
    IconPolygon,
    IconCrosshair,
    IconInfoCircle,
    IconChevronDown,
    IconChevronRight,
    IconBarrierBlock
} from '@tabler/icons-vue';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { getRuntimeToken } from '../../../src/std.ts';
import { useMapStore } from '../../../src/stores/map.ts';
import KV from '../../../src/base/kv.ts';
import { OriginMode } from '../../../src/base/cot.ts';
import type { Feature } from '../../../src/types.ts';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import {
    toKilometers,
    buildRings,
    ringTrailIntersections,
    clusterPoints,
    sortClockwise,
    sortAlongLine,
    type DistanceUnit
} from './geometry.ts';
import {
    listSnappingBasemaps,
    fetchTrailsAlongRings,
    type SnappingBasemap
} from './trails.ts';
import {
    nextLabelNumber,
    buildContainmentMarker,
    buildRingFeature
} from './markers.ts';
import {
    containmentFolderName,
    ensureContainmentFolder,
    withMissionFolderDest,
    attachFeaturesToFolder
} from './folder.ts';
import {
    createWisarClient,
    checkWisarConnection,
    type ConnectionCheck
} from './wisar.ts';
import { currentWisarServer, type WisarServer } from './wisarServer.ts';
import { wisarStartFor, type WisarStart } from './wisarSource.ts';

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

// 'containment' = ring/offset behavior; 'check' = raw line ∩ trails
const mode = ref<'containment' | 'check'>('containment');

// Line feature awaiting the Containment / Location Check choice
const pendingLine = ref<Feature | undefined>();

// Usage / help modal visibility
const showHelp = ref(false);

type PreviewMarker = {
    coordinates: Position;
    n: number;
    callsign: string;
    included: boolean;
};

const rings = ref<Position[][]>([]);
const previewMarkers = ref<PreviewMarker[]>([]);
const startNumber = ref(1);
const postedCount = ref(0);
const labelPrefixInput = ref('');
const generatedPrefix = ref('Containment');
const generatedFolderName = ref('Containment');
const selectAllBox = ref<HTMLInputElement | null>(null);

// False when the source is a mission line used as-is (distance 0):
// the geometry already exists in the mission, so don't repost it
const shouldPostRing = ref(true);

// Containment method (decision 17): a fixed distance, or WiSAR Travel Time
// from a single point (the Manual Point or a circle's centre)
const method = ref<'distance' | 'wisar'>('distance');
const wisarServer = ref<WisarServer>(currentWisarServer());
const wisarCheck = ref<ConnectionCheck | null>(null);
const wisarChecking = ref(false);
let wisarCheckAbort: AbortController | null = null;

// False when markers were numbered with no active DataSync. They are
// renumbered from the DataSync's existing markers once one is active.
const numberedFromMission = ref(true);

const config = ref({
    distance: 1,
    unit: 'miles' as DistanceUnit,
    spacing: 50,
    color: '#d63939',
    basemap: ''
});

// Manual point entry state
const manualOpen = ref(false);
const manualName = ref('');
const manualCoords = ref<number[]>([0, 0]);
const picking = ref(false);

const mission = computed(() => mapStore.mission);
const missionName = computed(() => mapStore.mission ? mapStore.mission.meta.name : '');

const distanceValid = computed(() => {
    if (typeof config.value.distance !== 'number' || isNaN(config.value.distance)) return false;
    if (selected.value && selected.value.geometry.type === 'Point') return config.value.distance > 0;
    return config.value.distance >= 0;
});

const wisarStart = computed<WisarStart>(() => {
    if (!selected.value) return { ok: false, reason: '' };

    return wisarStartFor({
        geometry: selected.value.geometry as Geometry,
        properties: selected.value.properties as Record<string, unknown>
    });
});

const canGenerate = computed(() => {
    if (mode.value === 'check' || method.value === 'distance') return distanceValid.value;

    // WiSAR Travel Time runs from the next build step
    return false;
});

const wisarStartLabel = computed(() => {
    const start = wisarStart.value;
    if (!start.ok) return '';

    const [lon, lat] = start.point;
    const where = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    return start.kind === 'circle'
        ? `Starts from the circle's centre (${where}).`
        : `Starts from the point (${where}).`;
});

const wisarServerSourceLabel = computed(() => {
    return wisarServer.value.source === 'incident-manager'
        ? '(from Incident Manager settings)'
        : '(default)';
});

const wisarStatusText = computed(() => {
    if (wisarChecking.value) return 'Checking WiSAR…';
    return wisarCheck.value ? wisarCheck.value.message : '';
});

const wisarStatusClass = computed(() => {
    const status = wisarCheck.value?.status;
    if (wisarChecking.value || !status) return 'text-secondary';
    if (status === 'ok') return 'text-success';
    if (status === 'degraded') return 'text-warning';
    return 'text-danger';
});

function isLineGeometry(feat: Feature): boolean {
    return ['LineString', 'MultiLineString'].includes(feat.geometry.type);
}

const labelPrefix = computed(() => {
    const custom = labelPrefixInput.value.trim();
    if (custom) return custom;
    return mode.value === 'check' ? 'Check Location' : 'Containment';
});

const blankMarkerExample = computed(() => {
    return mode.value === 'check' ? 'Check Location 1, 2, …' : 'Containment 1, 2, …';
});

const allMarkersIncluded = computed(() => {
    return previewMarkers.value.length > 0
        && previewMarkers.value.every((marker) => marker.included);
});

const canPost = computed(() => {
    if (posting.value) return false;
    if (!mission.value) return false;
    if (previewMarkers.value.some((marker) => marker.included)) return true;
    return shouldPostRing.value && rings.value.length > 0;
});

const unitOptions = ['Miles', 'Meters'];

const unitLabel = computed({
    get(): string {
        return config.value.unit === 'meters' ? 'Meters' : 'Miles';
    },
    set(value: string): void {
        config.value.unit = value === 'Meters' ? 'meters' : 'miles';
    }
});

const basemapOptions = computed(() => basemaps.value.map((bm) => bm.name));

const previewInfoDescription = computed(() => {
    const total = previewMarkers.value.length;
    const selected = previewMarkers.value.filter((marker) => marker.included);
    const plural = total === 1 ? '' : 's';

    if (!selected.length) {
        return `${total} trail crossing${plural} found. None selected to post.`;
    }

    if (selected.length === total) {
        const start = previewMarkers.value[0].callsign;
        const end = previewMarkers.value[total - 1].callsign;
        const range = total === 1 ? start : `${start} through ${end}`;
        return `${total} trail crossing${plural} found — previewed on the map as ${range}. Uncheck any you do not want to post.`;
    }

    return `${total} trail crossing${plural} found. ${selected.length} selected to post.`;
});

const doneDescription = computed(() => {
    const folder = generatedFolderName.value;
    const mission = missionName.value;

    if (postedCount.value === 0 && shouldPostRing.value) {
        return `Posted the containment ring to ${folder} in ${mission}.`;
    }

    const plural = postedCount.value === 1 ? '' : 's';
    const ring = shouldPostRing.value ? ' and the containment ring' : '';
    return `Posted ${postedCount.value} ${generatedPrefix.value} marker${plural}${ring} to ${folder} in ${mission}.`;
});

const sourceModeLabel = computed(() => {
    if (!selected.value) return '';

    if (mode.value === 'check') {
        return 'Location check — line crossings with the trail network';
    } else if (selected.value.geometry.type === 'Point') {
        return 'Range ring around point';
    } else if (isLineGeometry(selected.value)) {
        return 'Trail crossings along the line (distance 0 = the line itself)';
    }

    return 'Ring offset outward from boundary';
});

/**
 * Soft-ensure the Containment mission folder when an active DataSync is present.
 * Lack of write permission must not block configuration.
 */
async function softEnsureFolder(): Promise<void> {
    if (!mapStore.mission) return;

    try {
        await ensureContainmentFolder(mapStore.mission);
    } catch (err) {
        console.warn('Failed to ensure Containment mission folder', err);
    }
}

watch(mission, () => {
    void softEnsureFolder();
}, { immediate: true });

watch(mission, () => {
    renumberFromMission().catch((err) => {
        error.value = err instanceof Error ? err.message : String(err);
    });
});

watch(method, (value) => {
    if (value === 'wisar') void checkWisar();
});

// A source WiSAR can't start from falls back to Distance
watch(wisarStart, (start) => {
    if (!start.ok && method.value === 'wisar') method.value = 'distance';
});

watch(previewMarkers, () => {
    const box = selectAllBox.value;
    if (!box) return;

    const total = previewMarkers.value.length;
    const selected = previewMarkers.value.filter((marker) => marker.included).length;
    box.indeterminate = selected > 0 && selected < total;
}, { deep: true });

onMounted(async () => {
    await restoreSettings();
    await reload();
});

onBeforeUnmount(() => {
    wisarCheckAbort?.abort();
    stopPicking();
    removePreview();
});

function toggleManual(): void {
    manualOpen.value = !manualOpen.value;

    // Seed the coordinate field with the current map center on first open
    if (
        manualOpen.value
        && manualCoords.value[0] === 0
        && manualCoords.value[1] === 0
        && mapStore.map
    ) {
        const center = mapStore.map.getCenter();
        manualCoords.value = [
            Math.round(center.lng * 1000000) / 1000000,
            Math.round(center.lat * 1000000) / 1000000
        ];
    }

    if (!manualOpen.value) stopPicking();
}

const mapPickHandler = (e: MapMouseEvent): void => {
    manualCoords.value = [
        Math.round(e.lngLat.lng * 1000000) / 1000000,
        Math.round(e.lngLat.lat * 1000000) / 1000000
    ];

    stopPicking();
};

function togglePickFromMap(): void {
    if (picking.value) {
        stopPicking();
        return;
    }

    if (!mapStore.map) return;

    picking.value = true;
    mapStore.map.getCanvas().style.cursor = 'crosshair';
    mapStore.map.once('click', mapPickHandler);
}

function stopPicking(): void {
    picking.value = false;

    if (mapStore.map) {
        mapStore.map.getCanvas().style.cursor = '';
        mapStore.map.off('click', mapPickHandler);
    }
}

function useManualPoint(): void {
    stopPicking();

    const callsign = manualName.value.trim() || 'Manual Point';

    selected.value = {
        id: 'search-containment-manual',
        type: 'Feature',
        path: '/',
        properties: {
            callsign
        },
        geometry: {
            type: 'Point',
            coordinates: [manualCoords.value[0], manualCoords.value[1]]
        }
    } as unknown as Feature;

    mode.value = 'containment';
    error.value = '';
    stage.value = 'configure';
}

async function reload(): Promise<void> {
    loading.value = true;
    error.value = '';

    try {
        basemaps.value = await listSnappingBasemaps();

        if (basemaps.value.length && !basemaps.value.some((b) => b.name === config.value.basemap)) {
            config.value.basemap = basemaps.value[0].name;
        }

        await loadSources(true);

        wisarServer.value = currentWisarServer();
        if (method.value === 'wisar') void checkWisar();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

async function loadSources(refresh = false): Promise<void> {
    if (!mapStore.mission) {
        sources.value = [];
        return;
    }

    // refresh=true re-fetches the mission feature list from the TAK
    // Server rather than trusting the local cache
    const feats = await mapStore.mission.feature.list({ refresh });

    // Shapes and lines — point sources are handled by the Manual Point entry
    sources.value = feats.filter((feat) => {
        return ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(feat.geometry.type);
    });
}

function selectSource(feat: Feature): void {
    if (isLineGeometry(feat)) {
        // Ask whether the line is a containment boundary or a
        // location check before continuing
        pendingLine.value = feat;
        return;
    }

    selected.value = feat;
    mode.value = 'containment';
    error.value = '';
    stage.value = 'configure';
}

function chooseLineMode(chosen: 'containment' | 'check'): void {
    if (!pendingLine.value) return;

    selected.value = pendingLine.value;
    mode.value = chosen;
    pendingLine.value = undefined;
    error.value = '';
    stage.value = 'configure';
}

function backToPick(): void {
    removePreview();
    selected.value = undefined;
    mode.value = 'containment';
    error.value = '';
    stage.value = 'pick';
}

/**
 * Is WiSAR reachable at the server from Incident Manager's settings (or the
 * default), and does it accept this CloudTAK session?
 */
async function checkWisar(): Promise<void> {
    wisarCheckAbort?.abort();
    const abort = new AbortController();
    wisarCheckAbort = abort;

    wisarServer.value = currentWisarServer();
    wisarChecking.value = true;
    wisarCheck.value = null;

    try {
        const client = createWisarClient({ baseUrl: wisarServer.value.url, getToken: getRuntimeToken });
        const result = await checkWisarConnection(client, abort.signal);
        if (!abort.signal.aborted) wisarCheck.value = result;
    } catch (err) {
        if (!abort.signal.aborted) {
            wisarCheck.value = { status: 'error', message: err instanceof Error ? err.message : String(err) };
        }
    } finally {
        if (wisarCheckAbort === abort) wisarChecking.value = false;
    }
}

/**
 * Markers numbered with no active DataSync start at 1. Once a DataSync is
 * active, number them after its existing "{prefix} n" markers instead.
 */
async function renumberFromMission(): Promise<void> {
    if (!mapStore.mission || numberedFromMission.value) return;
    if (stage.value !== 'preview' || !previewMarkers.value.length) return;

    const prefix = generatedPrefix.value;
    const start = nextLabelNumber(await mapStore.mission.feature.list(), prefix);

    startNumber.value = start;
    previewMarkers.value = previewMarkers.value.map((marker, i) => ({
        ...marker,
        n: start + i,
        callsign: `${prefix} ${start + i}`
    }));
    numberedFromMission.value = true;

    syncPreviewPoints();
}

async function generate(): Promise<void> {
    if (!selected.value) return;

    generating.value = true;
    error.value = '';

    try {
        const basemap = basemaps.value.find((b) => b.name === config.value.basemap);
        if (!basemap) throw new Error('No trail network selected');

        // Location check always uses the raw line — no offset transform
        const distanceKm = mode.value === 'check'
            ? 0
            : toKilometers(config.value.distance, config.value.unit);

        const lineAsIs = isLineGeometry(selected.value) && distanceKm <= 0;

        shouldPostRing.value = !lineAsIs;

        rings.value = buildRings(selected.value.geometry, distanceKm);

        const trails = await fetchTrailsAlongRings(basemap, rings.value);

        const raw = ringTrailIntersections(rings.value, trails);
        const clustered = clusterPoints(raw, config.value.spacing);

        // Number along the drawn line when using it as-is,
        // otherwise clockwise around the ring
        const sorted = lineAsIs
            ? sortAlongLine(clustered, rings.value.flat())
            : sortClockwise(clustered);

        const prefix = labelPrefix.value;
        const missionFeatures = mapStore.mission ? await mapStore.mission.feature.list() : [];
        numberedFromMission.value = !!mapStore.mission;
        startNumber.value = nextLabelNumber(missionFeatures, prefix);
        generatedPrefix.value = prefix;
        generatedFolderName.value = containmentFolderName(labelPrefixInput.value);

        previewMarkers.value = sorted.map((coordinates, i) => {
            const n = startNumber.value + i;
            return {
                coordinates,
                n,
                callsign: `${prefix} ${n}`,
                included: true
            };
        });

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
        // In case the DataSync became active after Generate
        await renumberFromMission();

        // Folder must exist before publish so dest.path can reference its UID.
        // Prefixed layers are created here, not while the prefix is being typed.
        const folderName = generatedFolderName.value;
        const folder = await ensureContainmentFolder(mapStore.mission, folderName);
        const missionGuid = mapStore.mission.guid;
        const selectedMarkers = previewMarkers.value.filter((marker) => marker.included);

        // #region agent log
        // Console-only: remote CloudTAK CSP blocks localhost debug ingest
        let wsOpen: boolean | string = 'unknown';
        try {
            wsOpen = await mapStore.worker.conn.isOpen;
        } catch (e) {
            wsOpen = `err:${e instanceof Error ? e.message : String(e)}`;
        }
        console.warn('[containment-debug] confirm start', {
            folderUid: folder.uid,
            missionGuid,
            wsOpen,
            points: selectedMarkers.length,
            rings: rings.value.length,
            shouldPostRing: shouldPostRing.value
        });
        // #endregion

        const sourceName = selected.value && typeof selected.value.properties.callsign === 'string'
            ? selected.value.properties.callsign.trim()
            : '';

        const postedUids: string[] = [];

        /**
         * Publish into the mission folder:
         * 1. sendCOT with dest.path = folder UID (atomic filing; ETL pattern)
         * 2. local mission store via db.add authored:false + Mission origin
         *    (avoids SubscriptionFeature.update overwriting dest without path)
         */
        async function publishToFolder(feat: Feature, kind: string): Promise<void> {
            const wire = withMissionFolderDest(feat, missionGuid, folder.uid);
            mapStore.worker.conn.sendCOT(wire);

            await mapStore.worker.db.add({
                ...feat,
                origin: {
                    mode: OriginMode.MISSION,
                    mode_id: missionGuid
                }
            }, { authored: false });

            postedUids.push(String(feat.id));
            // #region agent log
            if (postedUids.length <= 2 || kind === 'ring') {
                console.warn('[containment-debug] publish', {
                    kind,
                    uid: String(feat.id),
                    index: postedUids.length - 1,
                    callsign: typeof feat.properties.callsign === 'string' ? feat.properties.callsign : ''
                });
            }
            // #endregion
        }

        if (shouldPostRing.value) {
            for (let i = 0; i < rings.value.length; i++) {
                const callsign = (sourceName ? sourceName + ' ' : '')
                    + 'Containment Ring'
                    + (rings.value.length > 1 ? ` ${i + 1}` : '');

                await publishToFolder(
                    buildRingFeature(rings.value[i], callsign, config.value.color),
                    'ring'
                );
            }
        }

        for (const marker of selectedMarkers) {
            await publishToFolder(
                buildContainmentMarker(
                    marker.coordinates,
                    marker.n,
                    config.value.color,
                    generatedPrefix.value
                ),
                'marker'
            );
        }

        // #region agent log
        console.warn('[containment-debug] published', {
            postedCount: postedUids.length,
            rings: shouldPostRing.value ? rings.value.length : 0,
            markers: selectedMarkers.length
        });
        // #endregion

        // Backup: move any UIDs still at mission root (if dest.path was ignored)
        if (postedUids.length) {
            try {
                await attachFeaturesToFolder(mapStore.mission, folder.uid, postedUids, {
                    folderName
                });
            } catch (attachErr) {
                // Features are already on the mission; folder filing is best-effort backup
                console.warn(attachErr);
                error.value = attachErr instanceof Error
                    ? attachErr.message
                    : String(attachErr);
            }
        }

        await mapStore.refresh();

        postedCount.value = selectedMarkers.length;
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
    previewMarkers.value = [];
    labelPrefixInput.value = '';
    postedCount.value = 0;
    error.value = '';
    stage.value = 'pick';

    loadSources().catch((err) => {
        error.value = err instanceof Error ? err.message : String(err);
    });
}

function toggleAllMarkers(event: Event): void {
    const checked = event.target instanceof HTMLInputElement
        ? event.target.checked
        : !allMarkersIncluded.value;

    for (const marker of previewMarkers.value) {
        marker.included = checked;
    }

    syncPreviewPoints();
}

function centerOnMarker(marker: PreviewMarker): void {
    const map = mapStore.map;
    if (!map) return;

    const [lng, lat] = marker.coordinates;
    map.easeTo({
        center: [lng, lat],
        duration: 500
    });
}

function previewCollection(): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: [
            ...rings.value.map((ring) => ({
                type: 'Feature' as const,
                properties: { role: 'ring' },
                geometry: {
                    type: 'LineString' as const,
                    coordinates: ring
                }
            })),
            ...previewMarkers.value.map((marker) => ({
                type: 'Feature' as const,
                properties: {
                    role: 'point',
                    label: marker.callsign,
                    included: marker.included
                },
                geometry: {
                    type: 'Point' as const,
                    coordinates: marker.coordinates
                }
            }))
        ]
    };
}

function syncPreviewPoints(): void {
    const map = mapStore.map;
    if (!map) return;

    const source = map.getSource(PREVIEW_SOURCE);
    if (source && source.type === 'geojson') {
        (source as GeoJSONSource).setData(previewCollection());
    }
}

function drawPreview(): void {
    const map = mapStore.map;
    if (!map) return;

    removePreview();

    map.addSource(PREVIEW_SOURCE, {
        type: 'geojson',
        data: previewCollection()
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
            'circle-stroke-width': 2,
            'circle-opacity': ['case', ['boolean', ['get', 'included'], true], 1, 0.35],
            'circle-stroke-opacity': ['case', ['boolean', ['get', 'included'], true], 1, 0.45]
        }
    });

    // Fit the map to the ring. Later checkbox changes only update the source.
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

<style scoped>
.plugin-pane,
.help-modal {
    /* Match Mission Info insets; Tabler form surfaces are primary-tinted */
    --tabler-input-bg: var(--cloudtak-inset-bg);
    --tblr-bg-forms: var(--cloudtak-inset-bg);
}

.normal-case {
    text-transform: none;
}

.cursor-pointer {
    cursor: pointer;
}

.marker-link {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.15em;
}

.marker-link:hover,
.marker-link:focus {
    color: inherit;
}
</style>
