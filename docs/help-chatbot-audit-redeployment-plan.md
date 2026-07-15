# Help Chatbot — Audit & Redeployment Plan

**Status:** Investigation + plan (no code changed yet)
**Component:** `frontend/src/components/HelpChatbot.tsx` (mounted globally in `Layout.tsx`)
**Date:** 2026-07-15

---

## 1. Recommended approach (start here)

The in-app assistant is a **static, client-side keyword matcher** — no LLM, no backend, no live data. It holds a hardcoded `knowledgeBase` of ~30 topics and ranks them against the user's text. It works, but its knowledge is roughly **one product-generation behind**: about **13 shipped pages/features are entirely absent**, **2 entries give factually wrong steps**, and none of **today's RBAC / employment-type** changes are represented.

Recommendation, in two phases:

- **Phase 1 (now, low-risk, ships with the frontend):** refresh and expand the static knowledge base to full current coverage, fix the wrong entries, surface the new topics in the menu, and harden the matcher's keywords. No infrastructure, no cost, instant rollback. This is what "make the chatbot up to date" requires and it's the bulk of the value.
- **Phase 2 (later, optional):** evaluate upgrading to an **LLM/RAG assistant** backed by a single maintained knowledge document, only if free-text accuracy on novel questions proves insufficient after Phase 1. This adds a backend, latency, cost, and prompt-injection surface — deferred deliberately given the priority on correctness and no-hallucination.

To stop the drift that caused this, Phase 1 also establishes a **single source of truth** for help content and a handbook checklist item ("update the help KB when you ship a user-facing feature").

---

## 2. How it works today (architecture)

| Aspect | Detail |
|---|---|
| Type | Rule-based keyword matcher, 100% client-side. No API/LLM call. |
| Knowledge | `knowledgeBase: Record<string, KBEntry>` — ~30 entries, each with `answer`, `keywords`, `followUp`. |
| Matching | `findKnowledgeEntry` scores each entry (exact/substring/token overlap), returns the best if score ≥ 30, else a generic fallback. |
| Role awareness | `isAdmin = role === 'Admin' \|\| role === 'Manager'` (from `getStoredRole`) — only gates whether "Admin/Manager Help" appears. |
| Entry points | Floating button → greeting → main menu (9 items) + free-text box. |
| Tests | One vitest case (`HelpChatbot.test.tsx`) — access-diagnostics only. |

Implication: the bot can only ever say what's hardcoded. Any question about a feature not in the KB falls through to the "I could not find an exact match" fallback. It cannot reason or pull live data.

---

## 3. Coverage today

**Covered (accurate):** getting started, app overview, dashboard, clock in/out, view hours, export CSV, reports, timeline, timesheet, timesheet approval, rejected entries, projects, project budgets, profile, avatar, settings, integrations (Taiga/Mattermost), troubleshooting, login issues, timer stuck, forgot password, admin/manager help, team management, access diagnostics, add user, approve time, audit logs, role permissions, request access.

---

## 4. Gaps — shipped features the bot knows *nothing* about

Each verified against the current routes (`App.tsx`), sidebar (`Sidebar.tsx`), and pages.

| # | Feature / page | Evidence | User questions that currently fail |
|---|---|---|---|
| G1 | **Leave & PTO** (`/leave`) — request leave, types (annual/sick/unpaid/public holiday), balance, approvals, history | `Leave.tsx`, `leaveController`, `LeaveRequest` model | "How do I request time off?", "What's my PTO balance?", "Approve a leave request" |
| G2 | **MFA / Two-Factor** (Settings) | `Settings.tsx` (MFA/Two-Factor/authenticator), `mfaController` | "How do I enable 2FA?", "Set up an authenticator app" |
| G3 | **Timer idle detection / auto-pause / resume** | `Timer.tsx` (idle/paused), timer policy config | "Why did my timer pause?", "Timer auto-stopped", "Resume after idle" |
| G4 | **Timer correction requests** | Admin corrections tab; `TimerCorrectionRequest` model | "Fix an approved entry", "Request a time correction" |
| G5 | **Invoices** (`/invoices`) | `invoiceController`, sidebar Billing | "Create an invoice", "Bill a client from tracked time" |
| G6 | **Templates** (`/templates`) | project templates | "What are project templates?" |
| G7 | **Scheduled Reports** (`/scheduled-reports`) | `scheduledReportController` | "Email me a weekly report", "Set report recipients" |
| G8 | **Webhooks** (`/webhooks`, Admin) | `webhookController` | "Set up a webhook", "Event subscriptions" |
| G9 | **Payroll periods** (Admin) | `payrollController`, `PayrollPeriod` model | "Lock a payroll period" |
| G10 | **Compliance modes (DCAA/FLSA/WTD), time rounding, password policy** (Admin → Compliance) | `adminController`, `complianceService` | "Turn on DCAA", "Round time to 15 min", "Set password rules" |
| G11 | **Branding** (Admin) | `brandingController`, `BrandingConfig` | "Change the logo / brand colors" |
| G12 | **Workday page** (`/workday`) | route + sidebar (Sparkles) | "What is the Workday page?" |
| G13 | **Notifications** (bell / list) | notifications routes | "Where are my notifications?" |
| **G14** | **TODAY: Employment type + minimum weekly hours + under-hours compliance** (employee/intern/contractor; Managers can't create Admins; two-field Add Member) | today's RBAC change (`employmentService`, `Team.tsx`, `adminController`) | "How do I mark someone as an intern?", "Set minimum weekly hours", "Why is an intern flagged for hours?", "Why can't I add an admin?" |

---

## 5. Stale / incorrect entries — must fix

| Entry | Problem | Correct behavior |
|---|---|---|
| `manual_entry` | **Wrong steps.** Says "Go to the Timer page → switch to Manual Entry mode." The Timer page has no such mode. | Manual time is added via **"Add Entry" on the Timeline page** (`Timeline.tsx` has the Add Entry action). |
| `add_user` | **Incomplete.** Lists "First name, Last name, Email, Temporary password, and Role." | The Add Member form now also has an **Employment Type** field (employee/intern/contractor). |
| `role_permissions` | **Outdated model.** Describes only Employee/Manager/Admin as if role = everything. | Must distinguish **access role** (Admin/Manager/Employee — Admin-only to change) from **employment type** (employee/intern/contractor — drives hours target, editable by Admin/Manager). |
| `profile` | **Slightly wrong.** "Your role and email can only be changed by an Admin or Manager." | Access-role changes are **Admin-only** (a Manager cannot change roles); Managers can set employment type. |
| `app_overview` / `admin_help` | **Incomplete.** Omit Leave, Invoices, Templates, Scheduled Reports, Webhooks, Payroll, Compliance, Employment type. | Extend to reflect the real navigation and manager/admin toolset. |
| Greeting line | **Overpromises.** "I know the main pages, role permissions, troubleshooting steps, and manager/admin tools" while missing ~13 areas. | Reword to match actual (expanded) coverage. |

---

## 6. Matching & UX issues

- **Recall gap (primary):** every Gap-section question hits the generic fallback because there's no entry and no keyword. This is the main "it feels dumb" symptom.
- **Precision risk:** the `score ≥ 30` threshold plus a per-token bonus can mis-route very short/common queries. Worth a small guard (require at least one non-trivial token match) once new entries increase overlap.
- **Discoverability:** the main menu exposes 9 topics; Leave, Team, Security, Billing, and Employment/Compliance aren't reachable except by keyword/follow-up. New categories should be added to the menu.
- **No unanswered-question signal:** the bot doesn't record misses, so gaps are invisible until a human notices. Optional: log unmatched queries (client console or a lightweight endpoint) to drive future KB updates.
- **Role scoping:** new admin/manager topics (employment type, compliance, payroll, webhooks, branding) should sit behind the existing `isAdmin` gate so Employees aren't shown irrelevant tools.

---

## 7. Redeployment plan (phased, with acceptance criteria)

### Phase 1 — Refresh + expand the static KB (recommended now)

1. **Add new KB entries** for G1–G14 (see §8 for the concrete list), each with `answer`, rich `keywords` (synonyms), and `followUp`.
2. **Fix the stale entries** in §5 (esp. `manual_entry` and `add_user` — these actively mislead).
3. **Expand the main menu + follow-ups**: add "Leave & PTO", "Security / 2FA", "Billing & Invoices", and (admin-gated) "Employment & Compliance".
4. **Harden matching keywords** for the new vocabulary: time off, PTO, vacation, 2FA/MFA/authenticator, timer paused/idle, correction, intern, contractor, minimum hours, invoice, webhook, scheduled report, payroll, rounding, branding.
5. **Update the greeting** to reflect true coverage; keep it honest.
6. **Role-gate** the admin-only topics behind `isAdmin`.
7. **Establish a source of truth**: keep the canonical Q&A in `docs/help-content.md` and add an `AGENT_HANDBOOK.md` checklist line — "ship a user-facing feature → add/ःupdate a HelpChatbot KB entry."
8. **Tests**: extend `HelpChatbot.test.tsx` with cases for Leave, MFA, employment type, and the corrected manual-entry answer.

**Acceptance criteria:**
- The canonical question set in §9 returns the correct topic (not the fallback).
- No entry gives steps that don't exist in the UI (manual entry, add user verified against the pages).
- Menu shows the new categories; admin-only topics hidden from Employees.
- `npm run test:unit` (vitest) and `tsc -b` are green.

### Phase 2 — LLM/RAG upgrade (optional, later)

Only if Phase 1's free-text accuracy is still insufficient. Sketch: a single maintained knowledge doc → embedded/retrieved → answered by an LLM with strict "answer only from context, else say you don't know" guardrails, PII-free, rate-limited, with prompt-injection defenses. Adds a backend endpoint, cost, and latency. Decision deferred — see §10.

---

## 8. Concrete new / updated KB entries (content to write in Phase 1)

New entries (keys): `leave_help`, `mfa_help`, `timer_idle_help`, `correction_request_help`, `invoices_help`, `templates_help`, `scheduled_reports_help`, `webhooks_help`, `payroll_help`, `compliance_modes_help`, `branding_help`, `workday_help`, `notifications_help`, `employment_type_help`, `minimum_hours_help`.

Updated entries: `manual_entry` (Timeline → Add Entry), `add_user` (add Employment Type step), `role_permissions` (access role vs employment type), `profile` (role change is Admin-only), `app_overview` (add Leave/Billing/Workspace items), `admin_help` (add leave approvals, employment type, compliance, payroll, webhooks), greeting.

Example — the two most important corrections and the flagship new entry:

- **`manual_entry` (fix):** "To add time manually, open the **Timeline** page and click **Add Entry**. Choose the project, enter a description, set the start and end times, and save. Manual entries are marked differently from timer-tracked ones and still go through approval."
- **`employment_type_help` (new, admin/manager):** "Each member has an **employment type** — Employee, Intern, or Contractor — separate from their access role. It sets the minimum weekly-hours target used for compliance (defaults: Employee 40h, Intern 10h, Contractor 40h; configurable in Admin → Compliance). Set it in **Team → Add/Edit member → Employment Type**. Because it's independent of access role, an intern temporarily elevated to Manager is still measured at the intern minimum."
- **`minimum_hours_help` (new):** "Under-hours flags compare logged time to the member's employment-type minimum, not a blanket 40h. Change the per-type minimums in **Admin → Compliance → Minimum Weekly Hours by Employment Type**."

---

## 9. Canonical question set (regression checklist for acceptance)

The bot must route each of these to the right topic (not the fallback):

1. "How do I request time off?" → leave
2. "What's my PTO balance?" → leave
3. "How do I turn on two-factor / 2FA?" → mfa
4. "Why did my timer pause by itself?" → timer idle
5. "How do I fix an approved time entry?" → correction request
6. "How do I add time manually?" → manual entry (**Timeline → Add Entry**)
7. "How do I create an invoice?" → invoices
8. "Email me a weekly report" → scheduled reports
9. "Set up a webhook" → webhooks
10. "How do I mark someone as an intern?" → employment type
11. "Set the minimum weekly hours for interns" → minimum hours / compliance
12. "Why is an intern flagged for not meeting hours?" → minimum hours
13. "Why can't I add an Admin user?" → role permissions / add user
14. "Turn on DCAA compliance" → compliance modes
15. "How do I add a team member?" → add user (**includes Employment Type**)

---

## 10. Testing, rollout, rollback

- **Test:** vitest unit tests + `tsc -b`. (Note: in the sandbox, vitest can't run — the Linux rollup native binary is missing from the macOS `node_modules` — so run vitest on your machine. `tsc -b` runs fine.)
- **Rollout:** Phase 1 is frontend-only and ships with the normal deploy (same pipeline as today's RBAC change). No migration, no backend.
- **Rollback:** revert the single commit; the bot is self-contained.

---

## 11. Open decisions (need your call)

1. **Scope of Phase 1:** full coverage of all 13 gaps now, or prioritize a top set (Leave, MFA, timer idle, employment type/compliance) first?
2. **Source of truth format:** maintain `docs/help-content.md` (human-readable) vs a structured `helpContent.ts` the component imports (single file, type-checked). Recommend the TS module so content and matcher stay in sync.
3. **Phase 2 (LLM upgrade):** worth scoping now, or revisit after Phase 1 ships and we see real unanswered-question logs?
4. **Miss logging:** add lightweight logging of unmatched questions to guide future updates? (privacy-safe, no PII).

---

*No code changed. On your go-ahead (and answers to §11), I'll implement Phase 1 — new/updated entries, expanded menu, hardened matching, and updated tests — then verify and prepare it for the same ship path as the RBAC change.*
