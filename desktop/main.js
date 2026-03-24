const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset' // Mac-like native feel
    });

    // In development mode, point to Vite's local dev server. 
    // In production, this would loadFile('dist/index.html')
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
    mainWindow.loadURL(startUrl);

    // Open DevTools automatically if in dev environment
    if (process.env.ELECTRON_START_URL) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    // Native Idle Detection capabilities via Electron's powerMonitor
    ipcMain.handle('getSystemIdleTime', () => {
        return powerMonitor.getSystemIdleTime();
    });

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
