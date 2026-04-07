import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircleQuestion, X, Send } from 'lucide-react';
import { getStoredRole } from '../utils/session';
import './HelpChatbot.css';

interface ChatMessage {
    id: number;
    from: 'bot' | 'user';
    text: string;
    options?: { label: string; key: string }[];
}

interface KBEntry {
    answer: string;
    followUp?: { label: string; key: string }[];
    keywords?: string[];
}

const knowledgeBase: Record<string, KBEntry> = {
    // Top-level categories
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
        answer: 'The app is organized into these main areas:\n\n- Dashboard: overview of today, alerts, and recent activity.\n- Timer: start or stop live timers and add manual time.\n- Timeline: chronological view of your daily entries.\n- Timesheet: weekly summary and approvals workflow.\n- Reports: analytics, exports, and team insights.\n- Team: managers/admins manage users and view Access Diagnostics.\n- Admin: admins manage projects, integrations, notifications, and audit logs.\n- Settings/Profile: personal preferences and password changes.\n- Integrations: Taiga, Mattermost, and other connected services.',
        keywords: ['app overview', 'what pages are in the app', 'webapp overview', 'how is the app organized', 'sections of the app', 'navigation'],
        followUp: [
            { label: 'Dashboard help', key: 'dashboard_help' },
            { label: 'Team Management help', key: 'team_management_help' },
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
    clock_in: {
        answer: 'To clock in:\n\n1. Go to the Timer page from the sidebar.\n2. Select a project from the dropdown (optional).\n3. Enter a task description.\n4. Click "Start Timer" to begin tracking.\n\nThe timer runs in the background even if you navigate to other pages.',
        keywords: ['clock in', 'start timer', 'begin work', 'timer page', 'how do i start time'],
        followUp: [
            { label: 'How do I stop the timer?', key: 'clock_out' },
            { label: 'Can I add time manually?', key: 'manual_entry' },
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
        answer: 'Yes! You can add time manually:\n\n1. Go to the Timer page.\n2. Switch to "Manual Entry" mode.\n3. Select the project, enter a description, and set start/end times.\n4. Click "Save Entry".\n\nManual entries are marked differently from timer-tracked entries.',
        keywords: ['manual entry', 'manual time', 'backfill time', 'log time manually', 'add time manually'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    timeline_help: {
        answer: 'Use the Timeline page to review your day as a sequence of work entries.\n\nYou can inspect what you worked on, when each entry started and ended, and in many cases open entries to edit them. It is the best place to review a day in chronological order.',
        keywords: ['timeline', 'daily timeline', 'chronological entries', 'edit entries', 'daily log'],
        followUp: [
            { label: 'Viewing my hours', key: 'view_hours' },
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
        answer: 'The Reports page is where analytics and exports live.\n\nYou can review time trends, project usage, user breakdowns, filters by date/project/user, and export reporting data. Managers and admins have broader visibility than employees.',
        keywords: ['reports', 'analytics', 'charts', 'report page', 'team reports'],
        followUp: [
            { label: 'Can I export my hours?', key: 'export_csv' },
            { label: 'Project budgets', key: 'project_budget' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    forgot_password: {
        answer: 'If you forgot your password:\n\n1. Click "Forgot your password?" on the login page.\n2. Enter your work email address.\n3. You will receive a reset code.\n4. Enter the code and set a new password.\n\nAlternatively, ask your Admin or Manager to reset your password from the Team Management page.',
        keywords: ['forgot password', 'reset password', 'password help', 'locked out'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    timesheet_approval: {
        answer: 'Your time entries need approval from a Manager or Admin:\n\n- Pending: Entry is awaiting review.\n- Approved: Entry has been verified and accepted.\n- Rejected: Entry was not accepted (you may need to correct and resubmit).\n\nYou can see the status of each entry on your Timeline page.',
        keywords: ['timesheet approval', 'approve time', 'pending approval', 'rejected entry'],
        followUp: [
            { label: 'My entry was rejected', key: 'entry_rejected' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    entry_rejected: {
        answer: 'If your time entry was rejected:\n\n1. Check the notification for any feedback.\n2. Create a new corrected entry with accurate times and description.\n3. The new entry will go through the approval process again.\n\nContact your Manager if you need clarification on why it was rejected.',
        keywords: ['entry rejected', 'rejected time', 'why was my time rejected'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    projects: {
        answer: 'Projects help organize your time tracking:\n\n- When starting a timer, select the project you are working on.\n- Each project may have a budget (hours and/or cost) set by your Admin.\n- You can see all available projects in the Timer page dropdown.\n\nAdmins and Managers can create, edit, and archive projects.',
        keywords: ['projects', 'project list', 'project assignment', 'project dropdown'],
        followUp: [
            { label: 'How are project budgets tracked?', key: 'project_budget' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    project_budget: {
        answer: 'Project budgets are tracked automatically:\n\n- Time Budget: Shows hours used vs. allocated hours.\n- Cost Budget: Shows cost burned vs. budgeted amount (based on hourly rates).\n- Both are visible in the Admin panel under Projects.\n\nBurn rates help managers ensure projects stay on track.',
        keywords: ['project budget', 'budget burn', 'cost burn', 'hours budget'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    profile: {
        answer: 'Your profile includes:\n\n- Name and email (can be updated from Profile page).\n- Avatar (choose an emoji or upload a photo).\n- Password (change from Profile page or through password reset).\n\nNote: Your role and email can only be changed by an Admin or Manager.',
        keywords: ['profile', 'my account', 'change password', 'account settings'],
        followUp: [
            { label: 'How do I change my avatar?', key: 'avatar_help' },
            { label: 'Settings help', key: 'settings_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    avatar_help: {
        answer: 'To change your avatar:\n\n1. Go to the Profile page.\n2. In the "Profile Avatar" section, choose from:\n   - Emoji Tab: Pick from 36 emoji options.\n   - Upload Tab: Upload a custom photo.\n3. Click "Save Avatar".\n\nYour avatar appears in the sidebar and anywhere your profile is shown.',
        keywords: ['avatar', 'profile photo', 'emoji avatar', 'upload photo'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    settings_help: {
        answer: 'The Settings area is for user preferences and account-level configuration. Use it when you need to adjust personal behavior or account defaults, while Profile focuses on your identity details like name, avatar, and password.',
        keywords: ['settings', 'preferences', 'account settings', 'user settings'],
        followUp: [
            { label: 'My profile', key: 'profile' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    integrations_help: {
        answer: 'Use the Integrations area to connect or manage supported tools such as Taiga and Mattermost. Admins typically configure shared integrations, while users may see integration-related status depending on permissions.',
        keywords: ['integrations', 'taiga', 'mattermost', 'connect tools', 'calendar integration'],
        followUp: [
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    troubleshooting: {
        answer: 'Common issues and fixes:\n\n- Timer not stopping? Refresh the page and try again.\n- Page not loading? Check your internet connection and sign in again.\n- Data looks wrong? Try refreshing or clearing your browser cache.\n- Cannot access a page? Your role may not have permission.\n\nFor persistent issues, contact your Admin.',
        keywords: ['troubleshooting', 'problem', 'issue', 'error', 'bug', 'broken'],
        followUp: [
            { label: 'I cannot log in', key: 'login_issues' },
            { label: 'Timer seems stuck', key: 'timer_stuck' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    login_issues: {
        answer: 'If you cannot log in:\n\n1. Double-check your email and password for typos.\n2. Make sure Caps Lock is not on.\n3. Try the "Forgot Password" flow to reset your password.\n4. Your account may be deactivated -- contact your Admin.\n5. Clear your browser cache and try again.\n\nIf you are a Manager or Admin helping someone else, open Team Management and use the Access Diagnostics panel on the right side to inspect failed login attempts, password reset requests, and the last successful login for that user.',
        keywords: ['login', 'sign in', 'cannot access', 'denied', 'login issue', 'sign in issue'],
        followUp: [
            { label: 'Reset my password', key: 'forgot_password' },
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timer_stuck: {
        answer: 'If your timer seems stuck:\n\n1. Refresh the page (F5 or Cmd+R).\n2. Check if the timer is still running on the Timer page.\n3. If the stop button does not work, try logging out and back in.\n4. Your timer state is preserved on the server, so no time is lost.\n\nIf the problem persists, contact your Admin.',
        keywords: ['timer stuck', 'timer frozen', 'timer not working', 'stop button broken'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    admin_help: {
        answer: 'As an Admin or Manager, you can:\n\n- Manage Team: Add, edit, reset passwords, change roles, deactivate users.\n- Use Access Diagnostics on the Team page to inspect login failures, password reset requests, and recent sign-in activity for a selected user.\n- Manage Projects: Create, edit, add logos, archive projects.\n- Approve Time: Review and approve/reject pending time entries.\n- Export Data: Download CSV reports of all tracked time.\n- View Audit Logs: Monitor system activity from the Admin page, including authentication events like failed logins and password resets.\n- View Notifications: See system-wide alerts.',
        keywords: ['admin help', 'manager help', 'admin features', 'manager features', 'team management'],
        followUp: [
            { label: 'How do I add a user?', key: 'add_user' },
            { label: 'How do I approve time?', key: 'approve_time' },
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Where are Audit Logs?', key: 'audit_logs_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    team_management_help: {
        answer: 'Team Management is where Managers and Admins manage people.\n\nOn the left and center you can search the team roster, edit members, change roles, activate or deactivate accounts, import CSV users, and export the team directory. On the right, the Access Diagnostics panel helps you investigate sign-in and password-reset issues for a selected user.',
        keywords: ['team management', 'manage users', 'team page', 'user management', 'member management'],
        followUp: [
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'How do I add a user?', key: 'add_user' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    access_diagnostics: {
        answer: 'Access Diagnostics is on the Team Management page.\n\n1. Open Team Management from the sidebar.\n2. Look at the right-hand panel beside the Team Directory.\n3. In the card titled "Access Diagnostics", use the search box to find the user by name or email.\n4. Choose the user from the filtered list.\n\nThe panel shows failed logins, reset requests, last successful login, and recent auth events with reasons like wrong password, disabled account, or expired reset code.',
        keywords: ['access diagnostics', 'where is access diagnostics', 'login diagnostics', 'sign in diagnostics', 'password reset diagnostics', 'find access diagnostics'],
        followUp: [
            { label: 'Login issues help', key: 'login_issues' },
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    add_user: {
        answer: 'To add a new team member:\n\n1. Go to Team Management from the sidebar.\n2. Click "Add Team Member".\n3. Fill in: First name, Last name, Email, Temporary password, and Role.\n4. Click "Add Member".\n\nThe new user can immediately sign in with the credentials you set.',
        keywords: ['add user', 'new user', 'create user', 'add member', 'new member'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    approve_time: {
        answer: 'To approve or reject time entries:\n\n1. Go to the Timesheet page.\n2. Look for entries with "Pending" status.\n3. Click "Approve" or "Reject" for each entry.\n4. The employee will be notified of your decision.\n\nYou can also view all pending approvals in one place.',
        keywords: ['approve time', 'review time', 'pending approvals', 'reject time'],
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    audit_logs_help: {
        answer: 'System Audit Logs are in the Admin page.\n\nOpen Admin from the sidebar, then switch to the "Audit Logs" tab. That area shows both general system audit activity and authentication events like failed logins, password reset requests, and other sign-in outcomes. For one-user troubleshooting with counters and recent history, Access Diagnostics on the Team page is still the fastest view.',
        keywords: ['audit logs', 'system audit logs', 'admin audit', 'where are audit logs'],
        followUp: [
            { label: 'Where is Access Diagnostics?', key: 'access_diagnostics' },
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    role_permissions: {
        answer: 'Roles control which pages and actions each person can access.\n\n- Employee: core routes like dashboard, timer, timeline, timesheet, reports, settings, profile, and their own data.\n- Manager: team visibility, approvals, team reporting, and Team Management tools.\n- Admin: everything managers can do, plus Admin page access, project management, integrations, notifications, and audit controls.',
        keywords: ['roles', 'permissions', 'admin vs manager', 'employee permissions', 'who can access what'],
        followUp: [
            { label: 'Admin/Manager Help', key: 'admin_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    request_access_help: {
        answer: 'If someone does not have an account yet, they can use the Request Access page from the sign-in screen. That sends their details for review so an Admin or Manager can create or approve access.',
        keywords: ['request access', 'need access', 'no account', 'how do i request access'],
        followUp: [
            { label: 'Getting Started', key: 'getting_started' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
};

const mainMenu = [
    { label: 'Getting Started', key: 'getting_started' },
    { label: 'App Overview', key: 'app_overview' },
    { label: 'Timer & Clocking In/Out', key: 'clock_in' },
    { label: 'Viewing My Hours', key: 'view_hours' },
    { label: 'Timesheet Approval', key: 'timesheet_approval' },
    { label: 'Projects', key: 'projects' },
    { label: 'My Profile & Avatar', key: 'profile' },
    { label: 'Password Help', key: 'forgot_password' },
    { label: 'Troubleshooting', key: 'troubleshooting' },
];

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const findKnowledgeEntry = (query: string): KBEntry | null => {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return null;
    }

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    let bestMatch: { score: number; entry: KBEntry } | null = null;

    for (const [key, entry] of Object.entries(knowledgeBase)) {
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

const HelpChatbot: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const bodyRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(0);
    const role = getStoredRole();
    const isAdmin = role === 'Admin' || role === 'Manager';

    const addMsg = useCallback((from: 'bot' | 'user', text: string, options?: { label: string; key: string }[]) => {
        idRef.current += 1;
        setMessages(prev => [...prev, { id: idRef.current, from, text, options }]);
    }, []);

    const showMenu = useCallback(() => {
        const opts = [...mainMenu];
        if (isAdmin) opts.push({ label: 'Admin/Manager Help', key: 'admin_help' });
        addMsg('bot', 'How can I help you today? Choose a topic or type your question:', opts);
    }, [addMsg, isAdmin]);

    useEffect(() => {
        if (open && messages.length === 0) {
            addMsg('bot', 'Hi there! I am the Web Forx Time Tracker assistant. I know the main pages, role permissions, troubleshooting steps, and manager/admin tools across the web app.');
            setTimeout(() => showMenu(), 300);
        }
    }, [open, messages.length, addMsg, showMenu]);

    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [messages]);

    const handleOption = (key: string) => {
        if (key === 'menu') {
            addMsg('user', 'Back to main menu');
            showMenu();
            return;
        }

        const entry = knowledgeBase[key];
        if (entry) {
            addMsg('user', key.replace(/_/g, ' '));
            addMsg('bot', entry.answer, entry.followUp);
        }
    };

    const handleTextSearch = () => {
        const q = input.trim().toLowerCase();
        if (!q) return;
        addMsg('user', input.trim());
        setInput('');

        const entry = findKnowledgeEntry(q);
        if (entry) {
            addMsg('bot', entry.answer, entry.followUp);
            return;
        }

        addMsg('bot', 'I could not find an exact match for that yet. Try one of these topics, or ask about a specific page like Dashboard, Timer, Team Management, Access Diagnostics, Reports, Admin, Integrations, or Settings.', [
            ...mainMenu,
            ...(isAdmin ? [{ label: 'Admin/Manager Help', key: 'admin_help' }] : []),
        ]);
    };

    return (
        <>
            <button className="chatbot-fab" onClick={() => setOpen(prev => !prev)} aria-label="Help chatbot">
                {open ? <X size={24} /> : <MessageCircleQuestion size={24} />}
                {!open && <span className="badge">?</span>}
            </button>

            {open && (
                <div className="chatbot-panel" role="dialog" aria-label="Help chatbot">
                    <div className="chatbot-header">
                        <div>
                            <h3>Help Assistant</h3>
                            <p>Ask me anything about the app</p>
                        </div>
                        <button onClick={() => setOpen(false)} aria-label="Close chatbot"><X size={16} /></button>
                    </div>

                    <div className="chatbot-body" ref={bodyRef}>
                        {messages.map(msg => (
                            <React.Fragment key={msg.id}>
                                <div className={`chat-msg ${msg.from}`}>
                                    {msg.text.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>{line}<br /></React.Fragment>
                                    ))}
                                </div>
                                {msg.options && (
                                    <div className="chat-options">
                                        {msg.options.map(opt => (
                                            <button key={opt.key} className="chat-option-btn" onClick={() => handleOption(opt.key)}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="chatbot-input">
                        <input
                            type="text"
                            placeholder="Type your question..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleTextSearch(); }}
                        />
                        <button onClick={handleTextSearch} aria-label="Send"><Send size={16} /></button>
                    </div>
                </div>
            )}
        </>
    );
};

export default HelpChatbot;
