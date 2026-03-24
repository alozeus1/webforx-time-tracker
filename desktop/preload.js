const { contextBridge, ipcRenderer } = require('electron');

// Expose native functionality to the React Frontend securely
contextBridge.exposeInMainWorld('electronAPI', {
    getSystemIdleTime: () => ipcRenderer.invoke('getSystemIdleTime')
});
