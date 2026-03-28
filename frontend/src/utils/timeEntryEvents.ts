export const TIME_ENTRY_CHANGED_EVENT = 'wfx:time-entry-changed';
export const TIME_ENTRY_CHANGED_STORAGE_KEY = 'wfx:last-time-entry-change';

export const emitTimeEntryChanged = () => {
    window.dispatchEvent(new CustomEvent(TIME_ENTRY_CHANGED_EVENT));

    try {
        window.localStorage.setItem(TIME_ENTRY_CHANGED_STORAGE_KEY, String(Date.now()));
    } catch {
        // Ignore storage write failures in private browsing or restricted contexts.
    }
};
