# Strict-logo preview plan

Set `STRICT_PROJECT_LOGO_VALIDATION=true` only in an isolated preview. Use
synthetic fixtures: valid <=2 MB PNG/JPEG/WebP, SVG, spoofed declared type,
malformed base64, exactly-2-MB and >2-MB data URLs. Verify create/update,
existing-logo rendering, safe errors without bytes/URLs in logs, and disabled
mode after rollback. Disable the flag to roll back; do not migrate/delete assets.
