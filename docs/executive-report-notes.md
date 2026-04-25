# Executive Timesheet PDF Notes

## Before

- Scheduled and daily PDF reports rendered one raw table.
- Long task descriptions forced cramped rows and broken column labels.
- Executives had to read detail rows to understand totals, status mix, and exceptions.

## After

- The PDF renderer now uses an executive template with:
  - branded cover and KPI summary
  - visual overview charts
  - approved, pending, and rejected status separation
  - employee detail grouping
  - project detail grouping
  - approval/sign-off page
  - report ID, generated timestamp, and page numbers in every footer

## Compatibility

- Existing scheduled report APIs, cron jobs, and email delivery remain unchanged.
- The legacy table renderer is still available by setting:

```bash
EXECUTIVE_REPORT_TEMPLATE_ENABLED=false
```

## Logo Configuration

The renderer uses repository defaults when no environment variables are provided:

- Company logo fallback: `frontend/public/webforx-logo.png`
- Time Tracker app logo fallback: `frontend/public/favicon.png`

Optional overrides:

```bash
REPORT_COMPANY_LOGO_PATH=/absolute/path/to/company-logo.png
REPORT_TIMER_APP_LOGO_PATH=/absolute/path/to/time-tracker-logo.png
```

If a logo cannot be loaded, the PDF renders a clean text fallback instead of failing.

## Local Preview

From `backend/`:

```bash
npm run report:preview
```

Optional output path:

```bash
npm run report:preview -- /tmp/webforx-executive-report.pdf
```
