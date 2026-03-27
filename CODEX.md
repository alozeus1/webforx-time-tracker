# Codex Context

Codex must load `AGENT_HANDBOOK.md` first.

Required read order:

1. `AGENT_HANDBOOK.md`
2. `docs/mvp.md`
3. `docs/app-route.md`
4. `DEPLOYMENT.md`

`AGENT_HANDBOOK.md` is the central reference for:

- architecture and functionality
- deployment settings and strategy
- disaster recovery and rollback
- troubleshooting and operational checks

## Security Rules

- Never store MCP credentials, API keys, or tokens in this repository (including `CODEX.md`).
- MCP server configuration must stay in global/user-local files only (for example `~/.codex/config.toml`).
- If per-project overrides are needed, use a hidden local file (for example `.codex.local.toml`) and keep it gitignored.
- Use environment variables for secrets; do not inline secret values in docs or tracked config files.
