# Mattermost Timer Bot

Slash-command integration that lets users start/stop timers and log time from Mattermost.

## 1. Create the slash command in Mattermost

Mattermost → **Integrations → Slash Commands → Add Slash Command**:

| Field | Value |
|---|---|
| Command Trigger Word | `timer` |
| Request URL | `https://<api-host>/api/v1/bots/mattermost/<orgSlug>` |
| Request Method | `POST` |
| Autocomplete | on (hint: `start [description] \| stop \| status \| log <mins> <desc> \| link \| help`) |

`<orgSlug>` is your organisation slug (shown in **Admin → Bot Integrations**). After saving, Mattermost shows a **verification token** — copy it.

## 2. Configure the Timer app (Admin)

In **Admin → Bot Integrations → Mattermost**, set:

- **Token** (required) — the slash-command verification token from step 1.
- **Mattermost base URL** (optional) — e.g. `https://mattermost.yourcompany.com`.
- **Bot token** (optional) — a Mattermost bot account's access token.

The bot token + base URL enable:

- **Email auto-link** — Mattermost users are matched to Timer users by email; no manual linking needed.
- **Interactive dialog** — `/timer start` with no description opens a dialog with a task field and a project picker (up to 20 active projects). Requires the bot account to exist and the API host to be reachable from the Mattermost server. The dialog callback URL is built from the `PUBLIC_API_URL` env var (falls back to the production backend URL).

To create the bot: Mattermost → **Integrations → Bot Accounts → Add Bot Account**, copy its token. For ephemeral confirmations after dialog submissions, add the bot to the relevant channels (best-effort; the timer starts regardless).

## 3. Linking accounts (users)

Resolution order per command: manual user map first, then email auto-link (if a bot token is configured).

Self-service linking:

1. In Mattermost run `/timer link` — you get a one-time 8-character code (valid 15 minutes).
2. In the Timer app go to **Profile → Linked Accounts — Mattermost**, enter the code, click **Link**.
3. `/timer unlink` removes the manual link (email auto-link still applies while a bot token is configured).

Admins can also maintain the user map directly in **Admin → Bot Integrations**.

## 4. Command reference

| Command | Effect |
|---|---|
| `/timer start <description>` | Start a timer immediately |
| `/timer start` | Open the interactive task/project dialog (bot token configured); otherwise starts with a default description |
| `/timer stop` | Stop the running timer and save a time entry |
| `/timer status` | Show the running timer and elapsed time |
| `/timer log <minutes> <description>` | Log a manual time entry |
| `/timer link` | Get a one-time account-linking code |
| `/timer unlink` | Remove your manual account link |
| `/timer help` | Show all commands |

All replies are ephemeral (visible only to you). Configuration problems (e.g. token mismatch) are also reported ephemerally instead of failing silently.

## Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/bots/mattermost/:orgSlug` | slash-command token | Slash command handler |
| `POST /api/v1/bots/mattermost/:orgSlug/dialog` | `state` token | Interactive dialog submission |
| `GET /api/v1/bots/mattermost/link` | user JWT | `{ linked, mm_user_id? }` for current user |
| `POST /api/v1/bots/mattermost/link` `{ code }` | user JWT | Redeem a linking code |
| `GET/PUT /api/v1/bots/mattermost/config` | Admin JWT | Bot configuration |
