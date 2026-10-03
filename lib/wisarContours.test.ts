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
    contourRingName,
    contourRings,
    intervalLocked,
    simplifyRing,
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

test('contour rings: the outer boundary of every part, holes ignored', () => {
    const f = contour(4, []);
    f.geometry = {
        type: 'MultiPolygon',
        coordinates: [
            [
                [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
                [[1, 1], [2, 1], [2, 2], [1, 1]],
            ],
            [[[10, 10], [11, 10], [11, 11], [10, 10]]],
            [[[20, 20], [21, 20], [20, 20]]],
        ],
    };
    const rings = contourRings(f);
    assert.equal(rings.length, 2);
    assert.deepEqual(rings[0], [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]);
    assert.deepEqual(rings[1], [[10, 10], [11, 10], [11, 11], [10, 10]]);
});

test('simplify removes stair-steps but keeps a closed ring', () => {
    const steps: [number, number][] = [];
    for (let i = 0; i <= 100; i++) steps.push([i * 0.0001, (i % 2) * 0.00001]);
    const ring: [number, number][] = [...steps, [0.01, 0.01], [0, 0.01], [0, 0]];
    const out = simplifyRing(ring);
    assert.ok(out.length < ring.length / 4);
    assert.deepEqual(out[0], out[out.length - 1]);
    assert.ok(out.length >= 4);
});

test('ring names follow the source and contour', () => {
    const f = contour(2, [[0, 0], [1, 0], [1, 1], [0, 0]]);
    assert.equal(contourRingName('ICP', f, 0, 1), 'ICP 2h Travel Time');
    assert.equal(contourRingName('ICP', f, 1, 3), 'ICP 2h Travel Time 2');
    assert.equal(contourRingName('', f, 0, 1), '2h Travel Time');
});
