import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Polygon } from 'geojson';
import { wisarStartFor } from './wisarSource.ts';

const square: Polygon = {
    type: 'Polygon',
    coordinates: [[[-111.7, 35.1], [-111.6, 35.1], [-111.6, 35.2], [-111.7, 35.2], [-111.7, 35.1]]],
};

test('point: used as-is', () => {
    const r = wisarStartFor({ geometry: { type: 'Point', coordinates: [-111.65, 35.19] } });
    assert.deepEqual(r, { ok: true, point: [-111.65, 35.19] });
});

test('point outside lon/lat range: refused', () => {
    assert.equal(wisarStartFor({ geometry: { type: 'Point', coordinates: [200, 35] } }).ok, false);
});

test('any shape, circles included: Distance only, with the reason', () => {
    const r = wisarStartFor({ geometry: square });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /shape has no single starting point/);
});

test('line: Distance only, with the reason', () => {
    const r = wisarStartFor({ geometry: { type: 'LineString', coordinates: [[-111.7, 35.1], [-111.6, 35.2]] } });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /line has no single starting point/);
});
