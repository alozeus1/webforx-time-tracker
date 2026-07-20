import { describe, it, expect, afterEach, vi } from 'vitest';
import { isMacPlatform, getModifierKeyLabel, getSearchShortcutLabel, isSearchShortcut } from '../utils/platform';

/**
 * Regression tests for the hardcoded "⌘K" search hint.
 * Windows/Linux users were shown the macOS Command symbol, a key they do not have.
 */

const stubNavigator = (props: Record<string, unknown>) => {
    vi.stubGlobal('navigator', { platform: '', userAgent: '', ...props } as unknown as Navigator);
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('platform detection', () => {
    it('detects macOS via the modern userAgentData.platform', () => {
        stubNavigator({ userAgentData: { platform: 'macOS' } });
        expect(isMacPlatform()).toBe(true);
        expect(getModifierKeyLabel()).toBe('⌘');
        expect(getSearchShortcutLabel()).toBe('⌘K');
    });

    it('detects macOS via legacy navigator.platform', () => {
        stubNavigator({ platform: 'MacIntel' });
        expect(isMacPlatform()).toBe(true);
        expect(getSearchShortcutLabel()).toBe('⌘K');
    });

    it('shows Ctrl+K on Windows', () => {
        stubNavigator({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
        expect(isMacPlatform()).toBe(false);
        expect(getModifierKeyLabel()).toBe('Ctrl');
        expect(getSearchShortcutLabel()).toBe('Ctrl+K');
    });

    it('shows Ctrl+K on Linux', () => {
        stubNavigator({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
        expect(isMacPlatform()).toBe(false);
        expect(getSearchShortcutLabel()).toBe('Ctrl+K');
    });

    it('treats iPadOS as an Apple platform (hardware keyboards use ⌘)', () => {
        stubNavigator({ platform: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' });
        expect(getSearchShortcutLabel()).toBe('⌘K');
    });

    it('falls back to Ctrl when the platform is unknown', () => {
        stubNavigator({});
        expect(getSearchShortcutLabel()).toBe('Ctrl+K');
    });
});

describe('isSearchShortcut', () => {
    const evt = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

    it('accepts Cmd+K (macOS)', () => {
        expect(isSearchShortcut(evt({ key: 'k', metaKey: true, ctrlKey: false, altKey: false }))).toBe(true);
    });

    it('accepts Ctrl+K (Windows/Linux)', () => {
        expect(isSearchShortcut(evt({ key: 'k', metaKey: false, ctrlKey: true, altKey: false }))).toBe(true);
    });

    it('is case-insensitive (Caps Lock / Shift)', () => {
        expect(isSearchShortcut(evt({ key: 'K', metaKey: false, ctrlKey: true, altKey: false }))).toBe(true);
    });

    it('ignores a bare "k" with no modifier so typing is unaffected', () => {
        expect(isSearchShortcut(evt({ key: 'k', metaKey: false, ctrlKey: false, altKey: false }))).toBe(false);
    });

    it('ignores other modifier combinations', () => {
        expect(isSearchShortcut(evt({ key: 'k', metaKey: false, ctrlKey: true, altKey: true }))).toBe(false);
        expect(isSearchShortcut(evt({ key: 'j', metaKey: true, ctrlKey: false, altKey: false }))).toBe(false);
    });
});
