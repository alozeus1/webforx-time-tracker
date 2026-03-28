import type { PrivacyMode } from './privacyMode';

export interface BrowserWorkSignal {
    id: string;
    title: string;
    path: string;
    startedAt: string;
    endedAt: string;
    source: 'route' | 'visibility';
}

const STORAGE_KEY = 'wfx-browser-work-signals';
const MAX_SIGNALS = 80;

const readSignals = (): BrowserWorkSignal[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as BrowserWorkSignal[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeSignals = (signals: BrowserWorkSignal[]) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(signals.slice(-MAX_SIGNALS)));
};

const redactTitle = (title: string, mode: PrivacyMode) => {
    if (mode === 'compliance') {
        return title;
    }

    if (mode === 'team_ops') {
        return title.replace(/\|.+$/, '').trim();
    }

    return 'Focused app activity';
};

export const getStoredWorkSignals = () => readSignals();

export const appendWorkSignal = (signal: BrowserWorkSignal) => {
    const signals = readSignals();
    signals.push(signal);
    writeSignals(signals);
};

export const recordRouteSession = (path: string, title: string, startedAt: Date, endedAt: Date, privacyMode: PrivacyMode) => {
    if (endedAt.getTime() <= startedAt.getTime()) {
        return;
    }

    appendWorkSignal({
        id: `${path}-${endedAt.getTime()}`,
        path,
        title: redactTitle(title, privacyMode),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        source: 'route',
    });
};

export const recordVisibilityPulse = (path: string, title: string, startedAt: Date, endedAt: Date, privacyMode: PrivacyMode) => {
    if (endedAt.getTime() <= startedAt.getTime()) {
        return;
    }

    appendWorkSignal({
        id: `visible-${path}-${endedAt.getTime()}`,
        path,
        title: redactTitle(title, privacyMode),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        source: 'visibility',
    });
};
