# Desktop wrapper

The Electron wrapper defaults to the production HTTPS app when packaged and to the local
Vite server in development. It does not capture screenshots, keystrokes, window titles,
or application activity. The only native signal exposed to the renderer is the operating
system's aggregate idle time.

Configuration:

- `DESKTOP_LOAD_MODE=remote` (default): loads `DESKTOP_APP_URL`, which must be HTTPS in
  production. The default production URL is `https://timer.dev.webforxtech.com`.
- `DESKTOP_LOAD_MODE=file`: loads `DESKTOP_RENDERER_PATH`, relative to the packaged app
  root (default `renderer/index.html`). Include that renderer in the package first.
- `DESKTOP_EXTERNAL_ORIGINS`: comma-separated exact HTTPS origins allowed to open in the
  system browser. Google Accounts is built in so calendar/auth navigation is visible and
  leaves the privileged renderer; all other new-window origins are denied by default.

The wrapper enforces a single instance, exact-origin in-app navigation, sandboxed and
context-isolated rendering, a narrow preload bridge, graceful macOS hide/show lifecycle,
and `CommandOrControl+Shift+T` to show the window. A tray is created only when
`assets/trayTemplate.png` exists; packaging does not fail when it is absent.

Run `npm run validate` for static syntax and security-policy tests. `npm run package:mac`
creates unsigned local artifacts with publishing disabled; signing/notarization and public
distribution remain an operator-owned release step.

Electron 43 is an intentional security-baseline upgrade from the unmaintained Electron 29
dependency. This repository does not publish binaries from CI, and the package audit and
static policy tests must pass before packaging. Target-macOS launch, sign-in/OAuth return,
tray imagery, signing, and notarization still require a manual release smoke pass. Google
OAuth opens in the system browser; a future signed desktop release should add an owned
deep-link callback if it needs to return directly to the desktop window.
