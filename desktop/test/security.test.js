const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PRODUCTION_APP_URL,
    buildWindowOptions,
    isAllowedAppNavigation,
    isAllowedExternalNavigation,
    resolveRendererTarget,
} = require('../security');

test('BrowserWindow defaults isolate and sandbox renderer code', () => {
    const options = buildWindowOptions({ preloadPath: '/app/preload.js', platform: 'darwin' });
    assert.equal(options.webPreferences.nodeIntegration, false);
    assert.equal(options.webPreferences.contextIsolation, true);
    assert.equal(options.webPreferences.sandbox, true);
    assert.equal(options.webPreferences.webSecurity, true);
    assert.equal(options.webPreferences.allowRunningInsecureContent, false);
});

test('packaged apps default to the HTTPS production origin', () => {
    const target = resolveRendererTarget({ isPackaged: true, env: {}, appPath: '/app' });
    assert.equal(target.kind, 'remote');
    assert.equal(new URL(target.value).origin, PRODUCTION_APP_URL);
});

test('remote renderer URLs fail closed outside HTTPS or local development', () => {
    assert.throws(() => resolveRendererTarget({
        isPackaged: true,
        env: { DESKTOP_APP_URL: 'http://example.com' },
        appPath: '/app',
    }), /HTTPS/);

    assert.doesNotThrow(() => resolveRendererTarget({
        isPackaged: false,
        env: { DESKTOP_APP_URL: 'http://127.0.0.1:5173' },
        appPath: '/app',
    }));
});

test('navigation and new windows use separate exact-origin allowlists', () => {
    const target = resolveRendererTarget({
        isPackaged: true,
        env: { DESKTOP_EXTERNAL_ORIGINS: 'https://docs.webforxtech.com' },
        appPath: '/app',
    });

    assert.equal(isAllowedAppNavigation(`${PRODUCTION_APP_URL}/timer`, target), true);
    assert.equal(isAllowedAppNavigation('https://evil.example/timer', target), false);
    assert.equal(isAllowedAppNavigation('https://user:password@timer.dev.webforxtech.com/timer', target), false);
    assert.equal(isAllowedExternalNavigation('https://docs.webforxtech.com/help', target.externalOrigins), true);
    assert.equal(isAllowedExternalNavigation('https://docs.webforxtech.com.evil.example/help', target.externalOrigins), false);
    assert.equal(isAllowedExternalNavigation('http://docs.webforxtech.com/help', target.externalOrigins), false);
    assert.equal(isAllowedExternalNavigation('https://accounts.google.com/o/oauth2/auth', target.externalOrigins), true);
});

test('file mode is confined to the resolved renderer directory', () => {
    const target = resolveRendererTarget({
        isPackaged: true,
        env: { DESKTOP_LOAD_MODE: 'file', DESKTOP_RENDERER_PATH: 'renderer/index.html' },
        appPath: '/Applications/TimeTracker.app/Contents/Resources/app',
    });

    assert.equal(isAllowedAppNavigation('file:///Applications/TimeTracker.app/Contents/Resources/app/renderer/index.html#/timer', target), true);
    assert.equal(isAllowedAppNavigation('file:///Applications/TimeTracker.app/Contents/Resources/app/renderer/assets/app.js', target), true);
    assert.equal(isAllowedAppNavigation('file:///Applications/TimeTracker.app/Contents/Resources/app/renderer-evil/index.html', target), false);
    assert.equal(isAllowedAppNavigation('file:///etc/passwd', target), false);

    assert.throws(() => resolveRendererTarget({
        isPackaged: true,
        env: { DESKTOP_LOAD_MODE: 'file', DESKTOP_RENDERER_PATH: '../../../../../etc/passwd' },
        appPath: '/Applications/TimeTracker.app/Contents/Resources/app',
    }), /packaged app directory/);
});
