// ─────────────────────────────────────────────────────────────────────────────
// Help Assistant knowledge base — SINGLE SOURCE OF TRUTH
//
// When you ship a user-facing feature, add or update an entry here (and, if it's
// a whole new area, add it to `mainMenu` and/or another entry's `followUp`).
// Keep answers factual and tied to what the UI actually does — the assistant is
// deterministic and will repeat whatever is written here verbatim.
//
// See docs/help-chatbot-audit-redeployment-plan.md (Phase 1) and
// docs/help-chatbot-phase2-llm-guidance.md (future LLM/RAG upgrade).
// ─────────────────────────────────────────────────────────────────────────────

export interface HelpMenuOption {
    label: string;
    key: string;
}

export interface KBEntry {
    answer: string;
    followUp?: HelpMenuOption[];
    keywords?: string[];
    /** Managers/Admins only — hidden from Employees in menus and free-text results. */
    adminOnly?: boolean;
}

export const knowledgeBase: Record<string, KBEntry> = {
    // ── Getting started / overview ───────────────────────────────────────────
    getting_started: {
        answer: 'Welcome! Here is how to get started:\n\n1. Your admin creates your account and provides login credentials.\n2. Sign in at the login page with your work email and password.\n3. The onboarding tour will guide you through key features.\n4. Start tracking time from the Timer page.',
        keywords: ['getting started', 'start here', 'first time', 'new user', 'onboarding', 'how do i start'],
        followUp: [
            { label: 'How do I clock in?', key: 'clock_in' },
            { label: 'Forgot my password', key: 'forgot_password' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    app_overview: {
        answer: 'The app is organized into these main areas:\n\n- Dashboard: overview of today, alerts, and recent activity.\n- Workday: your focused daily view of work and signals.\n- Timer: start or stop live timers.\n- Timeline: chronological view of your entries — also where you Add Entry (manual time).\n- Timesheet: weekly summary and approvals workflow.\n- Leave & PTO: request time off and track balances.\n- Reports: analytics, exports, and team insights.\n- Billing: Invoices, Templates, and Scheduled Reports (managers/admins).\n- Team: managers/admins manage users, employment types, and Access Diagnostics.\n- Admin: projects, compliance, payroll, integrations, webhooks, branding, and audit logs.\n- Settings/Profile: preferences, two-factor authentication, and password changes.',
        keywords: ['app overview', 'what pages are in the app', 'webapp overview', 'how is the app organized', 'sections of the app', 'navigation'],
        followUp: [
            { label: 'Dashboard help', key: 'dashboard_help' },
            { label: 'Leave & PTO', key: 'leave_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    dashboard_help: {
        answer: 'The Dashboard is your command center.\n\nIt shows things like today\'s tracked hours, quick activity summaries, alerts, and recent items that need attention. Managers and admins may also see team-level alerts and operational notifications there.',
        keywords: ['dashboard', 'home page', 'overview page', 'today summary'],
        followUp: [
            { label: 'Viewing my hours', key: 'view_hours' },
            { label: 'Reports help', key: 'reports_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    workday_help: {
        answer: 'The Workday page is your focused daily view.\n\nUse it to see your day at a glance — what you\'ve tracked, what\'s in progress, and prompts or signals to keep your time accurate. It complements the Timer (for live tracking) and the Timeline (for reviewing and editing entries).',
        keywords: ['workday', 'work day', 'my day', 'daily view', 'daily focus'],
        followUp: [
            { label: 'How do I clock in?', key: 'clock_in' },
            { label: 'Timeline help', key: 'timeline_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Timer / entries ──────────────────────────────────────────────────────
    clock_in: {
        answer: 'To clock in:\n\n1. Go to the Timer page from the sidebar.\n2. Select a project from the dropdown (optional).\n3. Enter a task description.\n4. Click "Start Timer" to begin tracking.\n\nThe timer runs in the background even if you navigate to other pages.',
        keywords: ['clock in', 'start timer', 'begin work', 'timer page', 'how do i start time'],
        followUp: [
            { label: 'How do I stop the timer?', key: 'clock_out' },
            { label: 'Can I add time manually?', key: 'manual_entry' },
            { label: 'Why did my timer pause?', key: 'timer_idle_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    clock_out: {
        answer: 'To clock out:\n\n1. Go to the Timer page.\n2. Add any notes about your work (optional).\n3. Click "Stop Timer".\n\nYour time entry will be saved automatically and sent for approval.',
        keywords: ['clock out', 'stop timer', 'end timer', 'finish work'],
        followUp: [
            { label: 'Where do I see my hours?', key: 'view_hours' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    manual_entry: {
        answer: 'To add time manually:\n\n1. Go to the Timeline page from the sidebar.\n2. Click "Add Entry".\n3. Choose the project, enter a description, and set the start and end times.\n4. Save the entry.\n\nManual entries are marked differently from timer-tracked ones and still go through the normal approval process.',
        keywords: ['manual entry', 'manual time', 'backfill time', 'log time manually', 'add time manually', 'add entry', 'enter time by hand'],
        followUp: [
            { label: 'Timeline help', key: 'timeline_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timer_idle_help: {
        answer: 'The timer watches for inactivity so your hours stay accurate.\n\n- If you stop interacting, it first shows an idle warning, then automatically pauses after the configured idle period.\n- You can resume a paused timer; if it was paused for a while you may be asked to add a note.\n- Long-running sessions may be auto-stopped at a maximum duration.\n\nYour timer state is kept on the server, so refreshing or switching devices will not lose it. Admins configure these thresholds in Admin → Policy.',
        keywords: ['timer paused', 'why did my timer pause', 'idle', 'auto pause', 'auto-pause', 'timer stopped by itself', 'inactivity', 'resume timer', 'heartbeat'],
        followUp: [
            { label: 'Timer seems stuck', key: 'timer_stuck' },
            { label: 'Request a time correction', key: 'correction_request_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    correction_request_help: {
        answer: 'If an entry is wrong — or an approved entry needs changing — you can request a correction.\n\nSubmit the corrected start/end times and a reason; a Manager or Admin reviews it. Under stricter compliance modes (e.g. DCAA), approved entries cannot be edited directly, so a correction request is the proper way to fix them. Managers and Admins review correction requests in Admin → Corrections.',
        keywords: ['correction', 'correction request', 'fix approved entry', 'amend time', 'edit approved time', 'change my time', 'wrong time entry'],
        followUp: [
            { label: 'My entry was rejected', key: 'entry_rejected' },
            { label: 'Timesheet approval', key: 'timesheet_approval' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timeline_help: {
        answer: 'Use the Timeline page to review your day as a sequence of work entries.\n\nYou can inspect what you worked on and when each entry started and ended, open entries to edit them, and use "Add Entry" to log time manually. It is the best place to review a day in chronological order.',
        keywords: ['timeline', 'daily timeline', 'chronological entries', 'edit entries', 'daily log'],
        followUp: [
            { label: 'Add time manually', key: 'manual_entry' },
            { label: 'Timesheet help', key: 'timesheet_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timesheet_help: {
        answer: 'The Timesheet page shows your weekly summary.\n\nYou can review hours per day and per project, and managers or admins can use approval tools there to review pending entries.',
        keywords: ['timesheet', 'weekly hours', 'weekly summary', 'approval queue'],
        followUp: [
            { label: 'Timesheet approval', key: 'timesheet_approval' },
            { label: 'Reports help', key: 'reports_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    view_hours: {
        answer: 'You can view your tracked hours in several places:\n\n- Timeline: See a chronological log of all your entries.\n- Timesheet: View a weekly/daily breakdown of hours.\n- Reports: See analytics and charts of your time data.\n- Dashboard: Quick overview of today\'s activity.',
        keywords: ['view hours', 'my hours', 'tracked time', 'see my time', 'where are my hours'],
        followUp: [
            { label: 'Can I export my hours?', key: 'export_csv' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    export_csv: {
        answer: 'To export your time data:\n\n1. Go to the Reports page.\n2. Click the "Export CSV" button.\n3. The file will download automatically with all your tracked entries.\n\nManagers and Admins can export data for all team members.',
        keywords: ['export csv', 'download csv', 'export report', 'download hours'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    reports_help: {
        answer: 'The Reports page is where analytics and exports live.\n\nYou can review time trends, project usage, user breakdowns, filters by date/project/user, and export reporting data. Managers and admins have broader visibility than employees, including an under-hours compliance view that measures each person against their employment-type minimum.',
        keywords: ['reports', 'analytics', 'charts', 'report page', 'team reports', 'under hours', 'compliance report'],
        followUp: [
            { label: 'Can I export my hours?', key: 'export_csv' },
            { label: 'Scheduled email reports', key: 'scheduled_reports_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Leave & PTO ──────────────────────────────────────────────────────────
    leave_help: {
        answer: 'Use the Leave & PTO page to request and track time off.\n\n1. Open "Leave & PTO" from the sidebar.\n2. Click to request leave: choose the type (annual, sick, unpaid, public holiday, or other), the dates, and an optional reason. Half-days are supported.\n3. Submit — a Manager or Admin reviews and approves or rejects it.\n\nThe page also shows your balances and the status/history of past requests. Managers and Admins review and act on pending requests there too.',
        keywords: ['leave', 'pto', 'time off', 'vacation', 'holiday', 'annual leave', 'sick leave', 'request leave', 'day off', 'book time off', 'balance'],
        followUp: [
            { label: 'Approvals (manager/admin)', key: 'approve_time' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Approvals ────────────────────────────────────────────────────────────
    timesheet_approval: {
        answer: 'Your time entries need approval from a Manager or Admin:\n\n- Pending: Entry is awaiting review.\n- Approved: Entry has been verified and accepted.\n- Rejected: Entry was not accepted (you may need to correct and resubmit).\n\nYou can see the status of each entry on your Timeline page.',
        keywords: ['timesheet approval', 'approve time', 'pending approval', 'rejected entry'],
        followUp: [
            { label: 'My entry was rejected', key: 'entry_rejected' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    entry_rejected: {
        answer: 'If your time entry was rejected:\n\n1. Check the notification for any feedback.\n2. Create a new corrected entry (or submit a correction request) with accurate times and description.\n3. It will go through the approval process again.\n\nContact your Manager if you need clarification on why it was rejected.',
        keywords: ['entry rejected', 'rejected time', 'why was my time rejected'],
        followUp: [
            { label: 'Request a time correction', key: 'correction_request_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Projects ─────────────────────────────────────────────────────────────
    projects: {
        answer: 'Projects help organize your time tracking:\n\n- When starting a timer, select the project you are working on.\n- Each project may have a budget (hours and/or cost) set by your Admin.\n- You can see all available projects in the Timer page dropdown.\n\nAdmins and Managers can create, edit, and archive projects.',
        keywords: ['projects', 'project list', 'project assignment', 'project dropdown'],
        followUp: [
            { label: 'How are project budgets tracked?', key: 'project_budget' },
            { label: 'Project templates', key: 'templates_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    project_budget: {
        answer: 'Project budgets are tracked automatically:\n\n- Time Budget: Shows hours used vs. allocated hours.\n- Cost Budget: Shows cost burned vs. budgeted amount (based on hourly rates).\n- Both are visible in the Admin panel under Projects.\n\nBurn rates help managers ensure projects stay on track.',
        keywords: ['project budget', 'budget burn', 'cost burn', 'hours budget'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },

    // ── Profile / settings / security ────────────────────────────────────────
    profile: {
        answer: 'Your profile includes:\n\n- Name and email (update from the Profile page).\n- Avatar (choose an emoji or upload a photo).\n- Password (change from the Profile page or via password reset).\n\nNote: your access role can only be changed by an Admin. Your employment type (employee/intern/contractor) can be set by a Manager or Admin.',
        keywords: ['profile', 'my account', 'change password', 'account settings'],
        followUp: [
            { label: 'How do I change my avatar?', key: 'avatar_help' },
            { label: 'Enable two-factor (2FA)', key: 'mfa_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    avatar_help: {
        answer: 'To change your avatar:\n\n1. Go to the Profile page.\n2. In the "Profile Avatar" section, choose from:\n   - Emoji Tab: Pick from 36 emoji options.\n   - Upload Tab: Upload a custom photo.\n3. Click "Save Avatar".\n\nYour avatar appears in the sidebar and anywhere your profile is shown.',
        keywords: ['avatar', 'profile photo', 'emoji avatar', 'upload photo'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    settings_help: {
        answer: 'The Settings area is for user preferences and account-level configuration, including two-factor authentication. Profile focuses on your identity details like name, avatar, and password, while Settings is where you adjust behavior and security options.',
        keywords: ['settings', 'preferences', 'account settings', 'user settings'],
        followUp: [
            { label: 'Enable two-factor (2FA)', key: 'mfa_help' },
            { label: 'My profile', key: 'profile' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    mfa_help: {
        answer: 'To enable two-factor authentication (2FA):\n\n1. Go to Settings.\n2. Find the "Two-Factor Authentication (MFA)" section.\n3. Follow the prompts to set it up with an authenticator app (scan the code / enter the key), then confirm with a one-time code.\n\nOnce enabled, you\'ll enter a code from your authenticator app at sign-in. If you lose access to your authenticator, ask an Admin for help.',
        keywords: ['mfa', '2fa', 'two factor', 'two-factor', 'authenticator', 'multi factor', 'security code', 'otp', 'enable 2fa'],
        followUp: [
            { label: 'Settings help', key: 'settings_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    notifications_help: {
        answer: 'Notifications keep you informed about approvals, rejections, alerts, and reminders.\n\nOpen the notification bell in the top bar to see recent items, mark them read, or dismiss them. Managers and admins may also receive team and operational alerts.',
        keywords: ['notifications', 'alerts', 'notification bell', 'reminders'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },

    // ── Integrations ─────────────────────────────────────────────────────────
    integrations_help: {
        answer: 'Use the Integrations area to connect or manage supported tools such as Taiga and Mattermost. Admins typically configure shared integrations, while users may see integration-related status depending on permissions.',
        keywords: ['integrations', 'taiga', 'mattermost', 'connect tools', 'calendar integration'],
        followUp: [
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Troubleshooting ──────────────────────────────────────────────────────
    troubleshooting: {
        answer: 'Common issues and fixes:\n\n- Timer paused on its own? That\'s idle auto-pause — just resume it.\n- Timer not stopping? Refresh the page and try again.\n- Page not loading? Check your internet connection and sign in again.\n- Data looks wrong? Try refreshing or clearing your browser cache.\n- Cannot access a page? Your role may not have permission.\n\nFor persistent issues, contact your Admin.',
        keywords: ['troubleshooting', 'problem', 'issue', 'error', 'bug', 'broken'],
        followUp: [
            { label: 'I cannot log in', key: 'login_issues' },
            { label: 'Timer seems stuck', key: 'timer_stuck' },
            { label: 'Why did my timer pause?', key: 'timer_idle_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    login_issues: {
        answer: 'If you cannot log in:\n\n1. Double-check your email and password for typos.\n2. Make sure Caps Lock is not on.\n3. If you use two-factor auth, enter the current code from your authenticator app.\n4. Try the "Forgot Password" flow to reset your password.\n5. Your account may be deactivated -- contact your Admin.\n\nIf you are a Manager or Admin helping someone else, open Team Management and use the Access Diagnostics panel on the right side to inspect failed login attempts, password reset requests, and the last successful login for that user.',
        keywords: ['login', 'sign in', 'cannot access', 'denied', 'login issue', 'sign in issue'],
        followUp: [
            { label: 'Reset my password', key: 'forgot_password' },
            { label: 'Enable/where is 2FA', key: 'mfa_help' },
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timer_stuck: {
        answer: 'If your timer seems stuck:\n\n1. Refresh the page (F5 or Cmd+R).\n2. Check if the timer is still running on the Timer page.\n3. If the stop button does not work, try logging out and back in.\n4. Your timer state is preserved on the server, so no time is lost.\n\nIf the problem persists, contact your Admin.',
        keywords: ['timer stuck', 'timer frozen', 'timer not working', 'stop button broken'],
        followUp: [
            { label: 'Why did my timer pause?', key: 'timer_idle_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    forgot_password: {
        answer: 'If you forgot your password:\n\n1. Click "Forgot your password?" on the login page.\n2. Enter your work email address.\n3. You will receive a reset code.\n4. Enter the code and set a new password.\n\nAlternatively, ask your Admin or Manager to reset your password from the Team Management page.',
        keywords: ['forgot password', 'reset password', 'password help', 'locked out'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    request_access_help: {
        answer: 'If someone does not have an account yet, they can use the Request Access page from the sign-in screen. That sends their details for review so an Admin or Manager can create or approve access.',
        keywords: ['request access', 'need access', 'no account', 'how do i request access'],
        followUp: [
            { label: 'Getting Started', key: 'getting_started' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Roles & access model ─────────────────────────────────────────────────
    role_permissions: {
        answer: 'The app has TWO separate concepts:\n\nAccess role — what you can do:\n- Employee: track own time, leave, view own data.\n- Manager: team visibility, approvals, team reports, and Team Management.\n- Admin: everything a Manager can do, plus the Admin page, projects, compliance, payroll, webhooks, and audit controls.\nOnly an Admin can change a person\'s access role.\n\nEmployment type — your work expectation (employee, intern, or contractor). It sets your minimum weekly-hours target for compliance and is independent of your access role. A Manager or Admin can set it. So someone can be a Manager (access) and an intern (employment type) at the same time.',
        keywords: ['roles', 'permissions', 'admin vs manager', 'employee permissions', 'who can access what', 'access role', 'access levels'],
        followUp: [
            { label: 'Employment types & hours', key: 'employment_type_help' },
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Manager / Admin tools ────────────────────────────────────────────────
    admin_help: {
        answer: 'As an Admin or Manager, you can:\n\n- Manage Team: add/edit users, set employment type, reset passwords, change roles (Admin only), deactivate users.\n- Approve work: review time entries, leave requests, and time-correction requests.\n- Access Diagnostics (Team page): inspect login failures, reset requests, and recent sign-in activity.\n- Manage Projects, Templates, and Invoices.\n- Reports & Scheduled Reports: analytics, CSV exports, and emailed report schedules.\n- Admin page: compliance modes, time rounding, password policy, payroll periods, integrations, webhooks, branding, and audit logs.',
        keywords: ['admin help', 'manager help', 'admin features', 'manager features', 'team management'],
        adminOnly: true,
        followUp: [
            { label: 'How do I add a user?', key: 'add_user' },
            { label: 'Employment types & hours', key: 'employment_type_help' },
            { label: 'Approvals', key: 'approve_time' },
            { label: 'Compliance & rounding', key: 'compliance_modes_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    team_management_help: {
        answer: 'Team Management is where Managers and Admins manage people.\n\nSearch the roster, add or edit members, set each member\'s employment type, change access roles (Admin only), activate/deactivate accounts, import CSV users, and export the directory. Deactivation blocks access but retains the member\'s email, time history, and memberships so the account can be restored. Only Admins can permanently delete an already-deactivated member; permanent deletion wipes their related data and cannot be undone. The Access Diagnostics panel on the right helps you investigate sign-in and password-reset issues for a selected user.',
        keywords: ['team management', 'manage users', 'team page', 'user management', 'member management'],
        adminOnly: true,
        followUp: [
            { label: 'How do I add a user?', key: 'add_user' },
            { label: 'Employment types & hours', key: 'employment_type_help' },
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    access_diagnostics: {
        answer: 'Access Diagnostics is on the Team Management page.\n\n1. Open Team Management from the sidebar.\n2. Look at the right-hand panel beside the Team Directory.\n3. In the card titled "Access Diagnostics", use the search box to find the user by name or email.\n4. Choose the user from the filtered list.\n\nThe panel shows failed logins, reset requests, last successful login, and recent auth events with reasons like wrong password, disabled account, or expired reset code.',
        keywords: ['access diagnostics', 'where is access diagnostics', 'login diagnostics', 'sign in diagnostics', 'password reset diagnostics', 'find access diagnostics'],
        adminOnly: true,
        followUp: [
            { label: 'Login issues help', key: 'login_issues' },
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    add_user: {
        answer: 'To add a new team member:\n\n1. Go to Team Management from the sidebar.\n2. Click "Add Team Member".\n3. Fill in: First name, Last name, Email, Temporary password, Role (access level), and Employment Type (employee/intern/contractor).\n4. Click "Add Member".\n\nManagers can create Employees, Interns, and Contractors but not Admins — only an Admin can create Admin accounts (the Admin option is hidden for Managers and blocked on the server).',
        keywords: ['add user', 'new user', 'create user', 'add member', 'add team member', 'add a team member', 'new member', 'cannot add admin', 'add admin'],
        adminOnly: true,
        followUp: [
            { label: 'Employment types & hours', key: 'employment_type_help' },
            { label: 'Roles & permissions', key: 'role_permissions' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    approve_time: {
        answer: 'To review and approve work:\n\n- Time entries: on the Timesheet page, review "Pending" entries and Approve or Reject each; the employee is notified.\n- Leave requests: on the Leave & PTO page, approve or reject pending requests.\n- Time corrections: in Admin → Corrections, review requested changes to entries.\n\nApprovals and rejections are recorded and visible to the member.',
        keywords: ['approve time', 'review time', 'pending approvals', 'reject time', 'approve leave', 'approvals'],
        adminOnly: true,
        followUp: [
            { label: 'Correction requests', key: 'correction_request_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    audit_logs_help: {
        answer: 'System Audit Logs are in the Admin page.\n\nOpen Admin from the sidebar, then switch to the "Audit Logs" tab. That area shows both general system audit activity and authentication events like failed logins, password reset requests, and other sign-in outcomes. For one-user troubleshooting with counters and recent history, Access Diagnostics on the Team page is still the fastest view.',
        keywords: ['audit logs', 'system audit logs', 'admin audit', 'where are audit logs'],
        adminOnly: true,
        followUp: [
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },

    // ── Employment type & compliance (today's RBAC work) ─────────────────────
    employment_type_help: {
        answer: 'Every member has an EMPLOYMENT TYPE — Employee, Intern, or Contractor — separate from their access role.\n\nIt sets the minimum weekly-hours target used for under-hours compliance (defaults: Employee 40h, Intern 10h, Contractor 40h; configurable in Admin → Compliance). Set it in Team → Add/Edit member → Employment Type (Managers and Admins can change it). Because it is independent of access role, an intern temporarily elevated to Manager is still measured at the intern minimum — so they won\'t be wrongly flagged for missing 40h.',
        keywords: ['employment type', 'intern', 'contractor', 'mark as intern', 'set intern', 'worker type', 'classification', 'employee type'],
        adminOnly: true,
        followUp: [
            { label: 'Minimum weekly hours', key: 'minimum_hours_help' },
            { label: 'Roles & permissions', key: 'role_permissions' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    minimum_hours_help: {
        answer: 'Under-hours compliance compares each person\'s logged time to the minimum for their EMPLOYMENT TYPE — not a blanket 40h.\n\nDefaults are Employee 40h, Intern 10h, Contractor 40h. Change the per-type minimums in Admin → Compliance → "Minimum Weekly Hours by Employment Type". You can also set a per-user override when editing a member. Existing users who have not been classified fall back to the Employee target until you set their type.',
        keywords: ['minimum hours', 'minimum weekly hours', 'set minimum weekly hours', 'minimum weekly hours for interns', 'weekly hours for interns', 'intern hours', 'weekly hours target', 'under hours', 'hours requirement', 'flagged for hours', 'not meeting hours', '40 hours', '10 hours'],
        adminOnly: true,
        followUp: [
            { label: 'Employment types', key: 'employment_type_help' },
            { label: 'Compliance modes', key: 'compliance_modes_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    compliance_modes_help: {
        answer: 'Admins configure compliance in Admin → Compliance:\n\n- Compliance mode: None, DCAA (locks approved entries — edits require a correction request), FLSA (overtime flags after 40h/week), or WTD (alerts when the 17-week average exceeds 48h).\n- Time rounding: round entry times to a chosen increment (e.g. nearest 15 min).\n- Password policy: set complexity and length rules.\n- Minimum weekly hours by employment type.',
        keywords: ['compliance', 'dcaa', 'flsa', 'wtd', 'compliance mode', 'time rounding', 'rounding', 'password policy', 'overtime rules'],
        adminOnly: true,
        followUp: [
            { label: 'Minimum weekly hours', key: 'minimum_hours_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    payroll_help: {
        answer: 'Payroll periods live in the Admin page.\n\nCreate periods (weekly, biweekly, semimonthly, or custom) and LOCK a period once its time is finalized so entries in that window can\'t be changed. You can unlock if a correction is needed. Locking gives you a clean, auditable cutoff for exporting payroll data.',
        keywords: ['payroll', 'payroll period', 'lock period', 'pay period', 'lock payroll'],
        adminOnly: true,
        followUp: [
            { label: 'Reports & exports', key: 'reports_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    branding_help: {
        answer: 'Admins can customize branding in the Admin page: organization name, logo, favicon, primary/secondary colors, custom domain, and the "email from" name/address used on outgoing emails. Changes apply across the app and email templates.',
        keywords: ['branding', 'logo', 'brand colors', 'white label', 'custom domain', 'email from', 'theme colors'],
        adminOnly: true,
        followUp: [{ label: 'Admin/Manager Help', key: 'admin_help' }, { label: 'Main menu', key: 'menu' }],
    },

    // ── Billing (manager/admin) ──────────────────────────────────────────────
    invoices_help: {
        answer: 'Invoices are under Billing (Managers/Admins).\n\nCreate an invoice for a client — optionally generated from tracked, billable time and hourly rates — set a tax rate and due date, add line items, and move it through draft → sent → paid. Invoices live on the Invoices page in the sidebar.',
        keywords: ['invoice', 'invoices', 'billing', 'bill a client', 'create invoice', 'client invoice'],
        adminOnly: true,
        followUp: [
            { label: 'Project budgets', key: 'project_budget' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    templates_help: {
        answer: 'Project Templates (Managers/Admins) let you spin up consistent projects fast.\n\nA template can carry a default billable setting, budget hours/amount, and default tags. Create and manage them on the Templates page, then use one when creating a new project.',
        keywords: ['template', 'templates', 'project template', 'reuse project settings'],
        adminOnly: true,
        followUp: [
            { label: 'Projects', key: 'projects' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    scheduled_reports_help: {
        answer: 'Scheduled Reports (Managers/Admins) email reports automatically.\n\nOn the Scheduled Reports page, set a frequency (e.g. weekly or monthly), a report type, and the recipient list. The system generates and sends the report on schedule so stakeholders get updates without anyone exporting manually.',
        keywords: ['scheduled report', 'scheduled reports', 'email report', 'automatic report', 'weekly report', 'recurring report', 'report schedule'],
        adminOnly: true,
        followUp: [
            { label: 'Reports help', key: 'reports_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    webhooks_help: {
        answer: 'Webhooks (Admins) push events to your own systems.\n\nOn the Webhooks page, add a subscription with a destination URL, choose which events to send, and use the signing secret to verify incoming payloads. Useful for wiring the time tracker into Slack/Mattermost, data pipelines, or custom automations.',
        keywords: ['webhook', 'webhooks', 'event subscription', 'callback url', 'integrate events', 'push events'],
        adminOnly: true,
        followUp: [
            { label: 'Integrations', key: 'integrations_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
};

// Base menu shown to everyone. Admin-only categories are appended by the
// component when the signed-in user is a Manager/Admin.
export const mainMenu: HelpMenuOption[] = [
    { label: 'Getting Started', key: 'getting_started' },
    { label: 'App Overview', key: 'app_overview' },
    { label: 'Timer & Clocking In/Out', key: 'clock_in' },
    { label: 'Add Time Manually', key: 'manual_entry' },
    { label: 'Viewing My Hours', key: 'view_hours' },
    { label: 'Leave & PTO', key: 'leave_help' },
    { label: 'Timesheet Approval', key: 'timesheet_approval' },
    { label: 'Projects', key: 'projects' },
    { label: 'My Profile & Avatar', key: 'profile' },
    { label: 'Two-Factor (2FA)', key: 'mfa_help' },
    { label: 'Password Help', key: 'forgot_password' },
    { label: 'Troubleshooting', key: 'troubleshooting' },
];

// Extra menu entries surfaced only to Managers/Admins.
export const adminMenu: HelpMenuOption[] = [
    { label: 'Admin/Manager Help', key: 'admin_help' },
    { label: 'Employment Types & Hours', key: 'employment_type_help' },
    { label: 'Compliance & Payroll', key: 'compliance_modes_help' },
];

export const normalizeQuery = (value: string): string => value.trim().toLowerCase();

// Common words that must NOT, on their own, be enough to match a topic.
// (They only affect the token-overlap bonus; exact/substring/keyword scoring
// is unaffected, so real matches still win.) This prevents queries like
// "how do i lock a payroll period" from matching an unrelated entry via
// "how"/"do"/"i".
const STOPWORDS = new Set([
    'how', 'do', 'i', 'a', 'an', 'the', 'my', 'is', 'are', 'to', 'for', 'of', 'on', 'in',
    'me', 'can', 'you', 'and', 'or', 'it', 'this', 'that', 'with', 'what', 'where', 'when',
    'why', 'does', 'did', 'get', 'got', 'be', 'been', 'was', 'about', 'from', 'up',
]);

/**
 * Deterministic keyword scorer. `includeAdminOnly` filters out manager/admin
 * topics for Employees so they aren't pointed at tools they can't use.
 */
export const findKnowledgeEntry = (
    query: string,
    options: { includeAdminOnly?: boolean } = {},
): KBEntry | null => {
    const { includeAdminOnly = true } = options;
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return null;
    }

    const queryTokens = normalizedQuery
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9]/g, ''))
        .filter((token) => token.length > 1 && !STOPWORDS.has(token));
    let bestMatch: { score: number; entry: KBEntry } | null = null;

    for (const [key, entry] of Object.entries(knowledgeBase)) {
        if (entry.adminOnly && !includeAdminOnly) {
            continue;
        }

        const searchTerms = [
            key.replace(/_/g, ' '),
            entry.answer,
            ...(entry.keywords || []),
            ...(entry.followUp?.map((item) => item.label) || []),
        ].map((term) => term.toLowerCase());

        let score = 0;

        for (const term of searchTerms) {
            if (term === normalizedQuery) {
                score = Math.max(score, 200);
            } else if (term.includes(normalizedQuery)) {
                score = Math.max(score, 120 + Math.min(normalizedQuery.length, 40));
            } else if (normalizedQuery.includes(term) && term.length > 3) {
                score = Math.max(score, 90 + Math.min(term.length, 30));
            }
        }

        const haystack = searchTerms.join(' ');
        const matchingTokens = queryTokens.filter((token) => haystack.includes(token));
        if (matchingTokens.length > 0) {
            score += matchingTokens.length * 12;
        }

        if (!bestMatch || score > bestMatch.score) {
            bestMatch = { score, entry };
        }
    }

    return bestMatch && bestMatch.score >= 30 ? bestMatch.entry : null;
};
