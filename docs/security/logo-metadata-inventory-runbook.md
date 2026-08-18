# DO NOT RUN WITHOUT AUTHORIZED PRODUCTION READ ACCESS

Use a read replica or off-peak window. Begin a read-only transaction and share
only aggregate rows. The discovered model is `Project.logo_url`; do not select
IDs, names, organisations, URLs, filenames, or image bytes.

First run representation/format counts only (cheap): classify `logo_url` with
`CASE` for `data:image/png`, `data:image/jpeg`, `data:image/webp`,
`data:image/svg+xml`, `/uploads/`, `http`, and unknown, grouped by category.
Run the optional data-URL size scan only after approval: count base64 payload
characters and derive `floor(chars * 3 / 4)`; return count `<= 2097152`, count
`> 2097152`, maximum derived size, and malformed count. Do not decode or fetch.
Local-reference existence cannot be determined without a filesystem inventory;
do not attempt it from SQL. No rollback is needed: every query is read-only.
