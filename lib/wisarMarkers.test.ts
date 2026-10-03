import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointMarkerOptions, type MarkerLike } from './wisarMarkers.ts';

function pt(id: string, callsign: unknown, coordinates: number[] = [-111.6, 35.2]): MarkerLike {
    return { id, geometry: { type: 'Point', coordinates }, properties: { callsign } };
}

test('points only; ICP/LKP/IPP/PLS first, then the rest alphabetically', () => {
    const opts = pointMarkerOptions([
        pt('a', 'Truck 2'),
        pt('b', 'LKP'),
        { id: 'poly', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { callsign: 'IPP area' } },
        pt('c', 'IPP-1'),
        pt('d', 'Containment 10'),
        pt('e', 'Containment 9'),
        pt('f', 'icp'),
        pt('g', 'PLS 2'),
    ]);
    assert.deepEqual(opts.map((o) => o.label), ['icp', 'IPP-1', 'LKP', 'PLS 2', 'Containment 9', 'Containment 10', 'Truck 2']);
});

test('a word that only starts with the letters is not a priority callsign', () => {
    const opts = pointMarkerOptions([pt('a', 'Alpha'), pt('b', 'IPPolito'), pt('c', 'Bravo')]);
    assert.deepEqual(opts.map((o) => o.label), ['Alpha', 'Bravo', 'IPPolito']);
});

test('repeated callsigns show their location; blank ones are Unnamed', () => {
    const opts = pointMarkerOptions([
        pt('a', 'IPP', [-111.6, 35.2]),
        pt('b', 'ipp', [-111.7, 35.3]),
        pt('c', '  '),
    ]);
    assert.deepEqual(opts, [
        { id: 'a', label: 'IPP (35.20000, -111.60000)' },
        { id: 'b', label: 'ipp (35.30000, -111.70000)' },
        { id: 'c', label: 'Unnamed' },
    ]);
});

test('points with no valid location are left out', () => {
    assert.deepEqual(pointMarkerOptions([pt('a', 'IPP', [200, 35]), pt('b', 'LKP', [Number.NaN, 35])]), []);
});
