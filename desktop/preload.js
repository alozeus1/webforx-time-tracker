const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
    getSystemIdleTime: () => ipcRenderer.invoke('desktop:get-system-idle-seconds'),
}));
