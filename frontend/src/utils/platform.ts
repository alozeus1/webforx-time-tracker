/**
 * Platform detection for OS-appropriate keyboard shortcut hints.
 *
 * The search bar used to hardcode "(Press ⌘K)", which is the macOS Command symbol.
 * Windows and Linux users were shown a key that does not exist on their keyboard.
 * These helpers let the UI render the correct modifier for the current OS.
 *
 * Detection order:
 *   1. navigator.userAgentData.platform — the modern, non-deprecated source.
 *   2. navigator.platform — widely supported, deprecated but still accurate.
 *   3. navigator.userAgent — last-resort fallback.
 *
 * Always safe to call: returns false when `navigator` is unavailable (SSR/tests).
 */

interface NavigatorUAData {
    platform?: string;
}

export const isMacPlatform = (): boolean => {
    if (typeof navigator === 'undefined') {
        return false;
    }

    const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
    const platform = uaData?.platform || navigator.platform || navigator.userAgent || '';

    // iPad/iPhone included so iPadOS with a hardware keyboard gets ⌘ as well.
    return /mac|iphone|ipad|ipod/i.test(platform);
};

/** The modifier key label for the current OS: "⌘" on Apple platforms, "Ctrl" elsewhere. */
export const getModifierKeyLabel = (): string => (isMacPlatform() ? '⌘' : 'Ctrl');

/**
 * Human-readable label for the global search shortcut.
 * macOS -> "⌘K", Windows/Linux -> "Ctrl+K"
 */
export const getSearchShortcutLabel = (): string => (isMacPlatform() ? '⌘K' : 'Ctrl+K');

/**
 * True when a keyboard event is the "open search" chord for the current platform.
 * Accepts BOTH Cmd+K and Ctrl+K regardless of OS, so external keyboards and
 * remote-desktop setups (where the reported platform may not match the physical
 * keyboard) still work.
 */
export const isSearchShortcut = (event: KeyboardEvent): boolean =>
    (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k';
