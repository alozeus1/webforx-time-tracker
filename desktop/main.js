const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    Menu,
    nativeImage,
    powerMonitor,
    shell,
    Tray,
} = require('electron');
const path = require('path');
const {
    buildWindowOptions,
    resolveRendererTarget,
    isAllowedAppNavigation,
    isAllowedExternalNavigation,
} = require('./security');

let mainWindow = null;
let tray = null;
let quitting = false;

const rendererTarget = resolveRendererTarget({
    isPackaged: app.isPackaged,
    env: process.env,
    appPath: app.getAppPath(),
});

const showMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    mainWindow.show();
    mainWindow.focus();
};

const createWindow = () => {
    mainWindow = new BrowserWindow(buildWindowOptions({
        preloadPath: path.join(__dirname, 'preload.js'),
        platform: process.platform,
    }));

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedExternalNavigation(url, rendererTarget.externalOrigins)) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isAllowedAppNavigation(url, rendererTarget)) return;
        event.preventDefault();
        if (isAllowedExternalNavigation(url, rendererTarget.externalOrigins)) {
            void shell.openExternal(url);
        }
    });

    mainWindow.on('close', (event) => {
        if (!quitting && process.platform === 'darwin') {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (rendererTarget.kind === 'file') {
        void mainWindow.loadFile(rendererTarget.value);
    } else {
        void mainWindow.loadURL(rendererTarget.value);
    }

    return mainWindow;
};

const createTray = () => {
    const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) return;

    tray = new Tray(icon);
    tray.setToolTip('Web Forx Time Tracker');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Time Tracker', click: showMainWindow },
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showMainWindow);
};

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', showMainWindow);

    app.whenReady().then(() => {
        ipcMain.handle('desktop:get-system-idle-seconds', () => powerMonitor.getSystemIdleTime());
        createWindow();
        createTray();

        globalShortcut.register('CommandOrControl+Shift+T', showMainWindow);

        app.on('activate', showMainWindow);
    });
}

app.on('before-quit', () => {
    quitting = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    ipcMain.removeHandler('desktop:get-system-idle-seconds');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
