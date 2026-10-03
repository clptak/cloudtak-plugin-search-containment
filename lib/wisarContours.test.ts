import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ContourCollection, ContourFeature } from './wisar.ts';
import { INTERVAL_OPTIONS } from './wisarTravelTime.ts';
import {
    SC_DEFAULT_INTERVALS,
    SC_MAX_INTERVALS,
    contourBounds,
    contourKey,
    contourName,
    intervalLocked,
    sortedContours,
} from './wisarContours.ts';

function contour(hours: number, coords: number[][]): ContourFeature {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: {
            callsign: `${hours}h`, remarks: '', color: '#ff0000', threshold_m: hours * 1000, hours,
            stroke: '#ff0000', 'stroke-width': 3, 'stroke-opacity': 1, fill: '#ff0000', 'fill-opacity': 0.1,
        },
    };
}

test('defaults are web-tool intervals, within the limit', () => {
    assert.ok(SC_DEFAULT_INTERVALS.length <= SC_MAX_INTERVALS);
    for (const h of SC_DEFAULT_INTERVALS) assert.ok(INTERVAL_OPTIONS.includes(h));
});

test('a 4th interval is locked; checked ones stay changeable', () => {
    assert.equal(intervalLocked([2, 4], 6), false);
    assert.equal(intervalLocked([2, 4, 6], 8), true);
    assert.equal(intervalLocked([2, 4, 6], 4), false);
});

test('contours sorted inner first, keyed and named by hours', () => {
    const fc: ContourCollection = {
        type: 'FeatureCollection',
        features: [
            contour(6, [[0, 0], [3, 0], [3, 3], [0, 0]]),
            contour(2, [[1, 1], [2, 1], [2, 2], [1, 1]]),
            contour(1.5, [[1, 1], [2, 1], [2, 2], [1, 1]]),
        ],
    };
    const rows = sortedContours(fc);
    assert.deepEqual(rows.map(contourKey), ['1.5', '2', '6']);
    assert.deepEqual(rows.map(contourName), ['1.5h Travel Time', '2h Travel Time', '6h Travel Time']);
    assert.deepEqual(contourBounds(fc), [0, 0, 3, 3]);
    assert.equal(contourBounds({ type: 'FeatureCollection', features: [] }), null);
});
