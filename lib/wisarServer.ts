/**
 * Which WiSAR server Search Containment uses.
 *
 * SC has no WiSAR setting of its own (decision 17): it follows Incident
 * Manager's per-browser "WiSAR Server" override, read from IM's settings in
 * this browser's localStorage, and otherwise uses the branch default in
 * wisar.ts. Read-only: SC never writes IM's settings.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
import { WISAR_DEFAULT_URL, normalizeBaseUrl } from './wisar.ts';

/** Incident Manager's settings key (IM src/lib/pluginSettings.ts PLUGIN_SETTINGS_KEY). */
export const IM_SETTINGS_KEY = 'incident-manager:settings';

export type WisarServerSource = 'incident-manager' | 'default';

export interface WisarServer {
    url: string;
    source: WisarServerSource;
}

/**
 * Resolve the server from the raw value stored under IM_SETTINGS_KEY.
 * Anything missing, blank, malformed or not http(s) falls back to the default.
 */
export function wisarServerFromImSettings(raw: string | null | undefined, fallback = WISAR_DEFAULT_URL): WisarServer {
    let override = '';
    if (raw) {
        try {
            const rec = JSON.parse(raw) as unknown;
            if (rec && typeof rec === 'object' && typeof (rec as { wisarUrl?: unknown }).wisarUrl === 'string') {
                override = normalizeBaseUrl((rec as { wisarUrl: string }).wisarUrl);
            }
        } catch {
            override = '';
        }
    }
    if (override) return { url: override, source: 'incident-manager' };
    return { url: normalizeBaseUrl(fallback), source: 'default' };
}

/** The server for this browser. Safe when localStorage is unavailable. */
export function currentWisarServer(): WisarServer {
    try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(IM_SETTINGS_KEY);
        return wisarServerFromImSettings(raw);
    } catch {
        return wisarServerFromImSettings(null);
    }
}
