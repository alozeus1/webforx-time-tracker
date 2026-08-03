# Admin/Manager MFA Reset — Design

Status: Approved
Date: 2026-07-21

## Problem

`POST /auth/mfa/disable` (self-service MFA disable, `backend/src/controllers/mfaController.ts`)
requires the user's current password **and** a valid TOTP code from their authenticator. A user
who loses or resets their phone cannot produce a TOTP code, so this self-service path is
unusable for exactly the case it needs to cover. There is currently no override anywhere in the
app — no endpoint, no admin UI action — so an MFA-enabled user who loses their device is
permanently locked out of their own account. This was flagged as a real, currently-experienced
operational gap.

## Goal

Give Admins, and Managers org-wide (see "Manager scope" below), the ability to reset a user's
MFA enrollment, so the user can log in with just their password and re-enroll a new device
through the existing self-service `/auth/mfa/setup` → `/auth/mfa/verify` flow.

## Non-goals

- No new "forced re-enrollment" state. Resetting MFA fully disables it (same end state as
  self-service disable); the user re-enables it themselves whenever they're ready, exactly like
  first-time setup.
- No real per-team manager scoping. See "Manager scope" below — that concept does not exist
  anywhere in this codebase today and is out of scope for this change.
- No additional re-authentication step for the admin performing the reset (e.g. re-entering
  their own password). This matches every other sensitive user-management action in this app
  (role changes, deactivation, deletion), none of which require step-up auth beyond the
  existing session.

## Manager scope

`Team` has no owner/manager field, `User.team_name` is a free-text string with no referential
integrity, and every existing Manager-gated endpoint in this codebase (`/leave/all`,
`/timers/approvals`, `/reports/operations`, `/users/:id/auth-events`) already treats "Manager" as
an **organization-wide** role, not scoped to a specific team. This feature follows that exact
precedent: `requireRole(['Admin', 'Manager'])`, scoped only by `organization_id` — a Manager can
reset MFA for any user in their own organization, matching how Managers already operate
everywhere else in the app. Building real team-ownership modeling is a separate, larger effort
and is explicitly out of scope here.

## Backend design

### New endpoint

`POST /api/v1/users/:id/mfa/reset`

Added to `backend/src/routes/userRoutes.ts`, alongside the other per-user admin actions
(`updateUser`, `deleteUser`):

```ts
router.post(
    '/:id/mfa/reset',
    authenticateToken,
    requireRole(['Admin', 'Manager']),
    resetUserMfa,
);
```

(No `auditLog(...)` middleware — see "Audit trail" below: the actual audit write happens
inline inside `resetUserMfa`, matching the codebase's real convention.)

### Controller

New `resetUserMfa` function in `backend/src/controllers/mfaController.ts` (keeps all MFA
mutation logic in one file):

1. Resolve target user with `prisma.user.findFirst({ where: { id: req.params.id,
   organization_id: req.user!.organization_id } })` — the same tenant-isolation pattern used
   throughout `userController.ts`. Not found or belongs to a different org → `404`, no existence
   leak (do not distinguish "doesn't exist" from "not in your org").
2. If `user.mfa_enabled === false`: respond `200` idempotently, `{ message: 'MFA was already
   disabled for this user.', mfa_enabled: false }`. No error — an admin double-clicking or
   retrying after a timeout should never see a failure.
3. Otherwise:
   - `prisma.user.update({ where: { id }, data: { mfa_enabled: false, mfa_secret: null } })`.
   - `prisma.mfaChallenge.deleteMany({ where: { user_id: id } })` — purge any outstanding
     login-MFA challenges for the user (defensive; they'd expire naturally, but no reason to
     leave them).
   - Best-effort send the reset notification email (see below) — wrapped in try/catch, logs on
     failure, never blocks or fails the HTTP response. Same fire-and-forget shape as
     `forgotPassword`'s reset email in `authController.ts`.
   - Respond `200` with `{ message: 'MFA has been reset. The user can set up a new device from
     their account settings.', mfa_enabled: false }`.

### Email notification

New `sendMfaResetNotificationEmail` in `backend/src/services/emailService.ts`, following the
existing function shapes (`sendPasswordResetEmail`, `sendWelcomeEmail`): takes the user's email
and first name, sends a short transactional email stating their two-factor authentication was
reset by an administrator, with a note to contact their admin if they didn't expect this.

### Audit trail

`backend/src/middlewares/auditMiddleware.ts`'s `auditLog()` helper turned out to be unused
dead code — no route in this app currently wires it in. The actual established convention,
used 30+ times across `userController.ts`, `timeEntryController.ts`, `adminController.ts`, etc.,
is an inline `prisma.auditLog.create(...)` call wrapped in its own try/catch (logged on failure,
never fails the request). `resetUserMfa` follows that real convention: after updating the user,
it writes an `AuditLog` row with `action: 'user_mfa_reset'`, `resource: 'user'`, and
`metadata: { target_user_id, target_email }`.

### `getAllUsers` change

`backend/src/controllers/userController.ts` — add `mfa_enabled: true` to the `select` in
`getAllUsers` (currently not returned), so the frontend can render per-user MFA status.

## Frontend design

`frontend/src/pages/Admin.tsx`, Users tab, users table (~line 1900-1955):

- Add an "MFA" status column using the same badge styling already used for the Active/Inactive
  column (colored dot + label).
- When a row's `mfa_enabled` is `true` and the viewer's role is Admin or Manager, show a "Reset"
  text action next to the badge.
- Clicking it opens a `window.confirm` dialog naming the user (matches the existing pattern used
  for archiving a project: `Archive project "${project.name}"? ...`), e.g. `Reset MFA for
  ${first_name} ${last_name}? They will need to set up a new authenticator device.`
- On confirm, `POST /users/:id/mfa/reset`, then refresh the users list (or optimistically flip
  `mfa_enabled` to `false` for that row) and show a success toast/notification consistent with
  other admin actions on this page.

## Testing

Backend integration tests (Jest, following existing controller test conventions):

- Admin can reset another user's MFA in the same org → `200`, `mfa_enabled: false` in DB.
- Manager can reset another user's MFA in the same org → `200` (org-wide, not team-scoped).
- Employee role gets `403`.
- Target user in a different organization → `404` (not `403`, no existence leak).
- Resetting an already-disabled user is idempotent → `200`, no error, no unnecessary DB writes.
- Outstanding `MfaChallenge` rows for the target user are deleted after reset.
- Email send failure does not fail the request (mock the email service to throw; assert `200`
  still returned and error is logged, not surfaced).
- Audit log row is written with the correct `action`, `user_id` (actor), and `organization_id`.

## Open items / follow-ups (not blocking this change)

- `backend/package.json` still says `"version": "1.0.0"` while the latest git tag is `v1.0.1` —
  unrelated pre-existing drift, worth a one-line fix whenever convenient.
- Real per-team manager scoping (if ever wanted) is a separate, larger project — would require a
  `Team.manager_id` or similar ownership model, and auditing every existing Manager-gated
  endpoint for consistency.
