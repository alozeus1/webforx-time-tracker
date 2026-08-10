const path = require('path');
const { fileURLToPath } = require('url');

const PRODUCTION_APP_URL = 'https://timer.dev.webforxtech.com';
const DEVELOPMENT_APP_URL = 'http://localhost:5173';
const DEFAULT_EXTERNAL_ORIGINS = ['https://accounts.google.com'];

const parseOriginList = (value = '') => value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => new URL(item).origin);

const assertRemoteUrl = (value, allowDevelopmentHttp) => {
    const parsed = new URL(value);
    const allowedDevelopmentUrl = allowDevelopmentHttp
        && parsed.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(parsed.hostname);

    if (parsed.protocol !== 'https:' && !allowedDevelopmentUrl) {
        throw new Error('Desktop remote URL must use HTTPS (localhost HTTP is development-only).');
    }

    if (parsed.username || parsed.password) throw new Error('Desktop remote URL cannot contain credentials.');
    return parsed.toString();
};

const resolveRendererTarget = ({ isPackaged, env, appPath }) => {
    const development = !isPackaged && env.NODE_ENV !== 'production';
    const loadMode = env.DESKTOP_LOAD_MODE || 'remote';
    const externalOrigins = [...new Set([
        ...DEFAULT_EXTERNAL_ORIGINS,
        ...parseOriginList(env.DESKTOP_EXTERNAL_ORIGINS),
    ])];

    if (loadMode === 'file') {
        const rendererPath = path.resolve(appPath, env.DESKTOP_RENDERER_PATH || 'renderer/index.html');
        const relativeRendererPath = path.relative(path.resolve(appPath), rendererPath);
        if (relativeRendererPath.startsWith('..') || path.isAbsolute(relativeRendererPath)) {
            throw new Error('Desktop renderer file must remain inside the packaged app directory.');
        }
        return {
            kind: 'file',
            value: rendererPath,
            appDirectory: path.dirname(rendererPath),
            externalOrigins,
        };
    }

    if (loadMode !== 'remote') throw new Error('DESKTOP_LOAD_MODE must be "remote" or "file".');

    const value = assertRemoteUrl(
        env.DESKTOP_APP_URL || (development ? DEVELOPMENT_APP_URL : PRODUCTION_APP_URL),
        development,
    );

    return { kind: 'remote', value, appOrigin: new URL(value).origin, externalOrigins };
};

const buildWindowOptions = ({ preloadPath, platform }) => ({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: true,
    titleBarStyle: platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f8fafc',
    webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
    },
});

const isAllowedAppNavigation = (value, target) => {
    try {
        const parsed = new URL(value);
        if (target.kind === 'file') {
            if (parsed.protocol !== 'file:') return false;
            const candidatePath = fileURLToPath(parsed);
            const relative = path.relative(target.appDirectory, candidatePath);
            return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        }
        return !parsed.username && !parsed.password && parsed.origin === target.appOrigin;
    } catch {
        return false;
    }
};

const isAllowedExternalNavigation = (value, allowedOrigins) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' && allowedOrigins.includes(parsed.origin);
    } catch {
        return false;
    }
};

module.exports = {
    PRODUCTION_APP_URL,
    buildWindowOptions,
    isAllowedAppNavigation,
    isAllowedExternalNavigation,
    resolveRendererTarget,
};
