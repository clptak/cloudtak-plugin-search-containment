import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Polygon } from 'geojson';
import { circleCentre, wisarStartFor } from './wisarSource.ts';

const square: Polygon = {
    type: 'Polygon',
    coordinates: [[[-111.7, 35.1], [-111.6, 35.1], [-111.6, 35.2], [-111.7, 35.2], [-111.7, 35.1]]],
};

test('manual point: used as-is', () => {
    const r = wisarStartFor({ geometry: { type: 'Point', coordinates: [-111.65, 35.19] } });
    assert.deepEqual(r, { ok: true, kind: 'point', point: [-111.65, 35.19] });
});

test('point outside lon/lat range: refused', () => {
    assert.equal(wisarStartFor({ geometry: { type: 'Point', coordinates: [200, 35] } }).ok, false);
});

test('circle (equal ellipse axes): its centre', () => {
    const r = wisarStartFor({
        geometry: square,
        properties: { type: 'u-d-c-c', center: [-111.65, 35.15], shape: { ellipse: { major: 800, minor: 800, angle: 360 } } },
    });
    assert.deepEqual(r, { ok: true, kind: 'circle', point: [-111.65, 35.15] });
});

test('circle type with a centre but no ellipse: its centre', () => {
    assert.deepEqual(circleCentre({ geometry: square, properties: { type: 'u-r-b-c-c', center: ['-111.6', '35.1'] } }), [-111.6, 35.1]);
});

test('ellipse (unequal axes): Distance only', () => {
    const r = wisarStartFor({
        geometry: square,
        properties: { type: 'u-d-c-e', center: [-111.65, 35.15], shape: { ellipse: { major: 900, minor: 400, angle: 30 } } },
    });
    assert.equal(r.ok, false);
});

test('plain polygon, or circle type without a centre: Distance only', () => {
    assert.equal(wisarStartFor({ geometry: square, properties: { type: 'u-d-f' } }).ok, false);
    assert.equal(wisarStartFor({ geometry: square, properties: { type: 'u-d-c-c' } }).ok, false);
    assert.equal(wisarStartFor({ geometry: square }).ok, false);
});

test('line: Distance only, with the reason', () => {
    const r = wisarStartFor({ geometry: { type: 'LineString', coordinates: [[-111.7, 35.1], [-111.6, 35.2]] } });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.reason : '', /line has no single starting point/);
});
