import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WISAR_DEFAULT_URL } from './wisar.ts';
import { wisarServerFromImSettings } from './wisarServer.ts';

test('no IM settings: branch default', () => {
    assert.deepEqual(wisarServerFromImSettings(null), { url: WISAR_DEFAULT_URL, source: 'default' });
    assert.deepEqual(wisarServerFromImSettings(''), { url: WISAR_DEFAULT_URL, source: 'default' });
});

test('IM override is used and normalized', () => {
    const raw = JSON.stringify({ subjectTypes: [], wisarUrl: 'http://localhost:8000/api/v1/' });
    assert.deepEqual(wisarServerFromImSettings(raw), { url: 'http://localhost:8000', source: 'incident-manager' });
});

test('blank, missing, malformed or non-http override: default', () => {
    for (const raw of [
        JSON.stringify({ wisarUrl: '' }),
        JSON.stringify({ wisarUrl: '   ' }),
        JSON.stringify({ other: 1 }),
        JSON.stringify({ wisarUrl: 42 }),
        JSON.stringify({ wisarUrl: 'ftp://example.org' }),
        JSON.stringify(null),
        '[1,2]',
        '{not json',
    ]) {
        assert.equal(wisarServerFromImSettings(raw).source, 'default', raw);
    }
});
