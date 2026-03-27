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
}

const knowledgeBase: Record<string, KBEntry> = {
    // Top-level categories
    getting_started: {
        answer: 'Welcome! Here is how to get started:\n\n1. Your admin creates your account and provides login credentials.\n2. Sign in at the login page with your work email and password.\n3. The onboarding tour will guide you through key features.\n4. Start tracking time from the Timer page.',
        followUp: [
            { label: 'How do I clock in?', key: 'clock_in' },
            { label: 'Forgot my password', key: 'forgot_password' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    clock_in: {
        answer: 'To clock in:\n\n1. Go to the Timer page from the sidebar.\n2. Select a project from the dropdown (optional).\n3. Enter a task description.\n4. Click "Start Timer" to begin tracking.\n\nThe timer runs in the background even if you navigate to other pages.',
        followUp: [
            { label: 'How do I stop the timer?', key: 'clock_out' },
            { label: 'Can I add time manually?', key: 'manual_entry' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    clock_out: {
        answer: 'To clock out:\n\n1. Go to the Timer page.\n2. Add any notes about your work (optional).\n3. Click "Stop Timer".\n\nYour time entry will be saved automatically and sent for approval.',
        followUp: [
            { label: 'Where do I see my hours?', key: 'view_hours' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    manual_entry: {
        answer: 'Yes! You can add time manually:\n\n1. Go to the Timer page.\n2. Switch to "Manual Entry" mode.\n3. Select the project, enter a description, and set start/end times.\n4. Click "Save Entry".\n\nManual entries are marked differently from timer-tracked entries.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    view_hours: {
        answer: 'You can view your tracked hours in several places:\n\n- Timeline: See a chronological log of all your entries.\n- Timesheet: View a weekly/daily breakdown of hours.\n- Reports: See analytics and charts of your time data.\n- Dashboard: Quick overview of today\'s activity.',
        followUp: [
            { label: 'Can I export my hours?', key: 'export_csv' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    export_csv: {
        answer: 'To export your time data:\n\n1. Go to the Reports page.\n2. Click the "Export CSV" button.\n3. The file will download automatically with all your tracked entries.\n\nManagers and Admins can export data for all team members.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    forgot_password: {
        answer: 'If you forgot your password:\n\n1. Click "Forgot your password?" on the login page.\n2. Enter your work email address.\n3. You will receive a reset code.\n4. Enter the code and set a new password.\n\nAlternatively, ask your Admin or Manager to reset your password from the Team Management page.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    timesheet_approval: {
        answer: 'Your time entries need approval from a Manager or Admin:\n\n- Pending: Entry is awaiting review.\n- Approved: Entry has been verified and accepted.\n- Rejected: Entry was not accepted (you may need to correct and resubmit).\n\nYou can see the status of each entry on your Timeline page.',
        followUp: [
            { label: 'My entry was rejected', key: 'entry_rejected' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    entry_rejected: {
        answer: 'If your time entry was rejected:\n\n1. Check the notification for any feedback.\n2. Create a new corrected entry with accurate times and description.\n3. The new entry will go through the approval process again.\n\nContact your Manager if you need clarification on why it was rejected.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    projects: {
        answer: 'Projects help organize your time tracking:\n\n- When starting a timer, select the project you are working on.\n- Each project may have a budget (hours and/or cost) set by your Admin.\n- You can see all available projects in the Timer page dropdown.\n\nAdmins and Managers can create, edit, and archive projects.',
        followUp: [
            { label: 'How are project budgets tracked?', key: 'project_budget' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    project_budget: {
        answer: 'Project budgets are tracked automatically:\n\n- Time Budget: Shows hours used vs. allocated hours.\n- Cost Budget: Shows cost burned vs. budgeted amount (based on hourly rates).\n- Both are visible in the Admin panel under Projects.\n\nBurn rates help managers ensure projects stay on track.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    profile: {
        answer: 'Your profile includes:\n\n- Name and email (can be updated from Profile page).\n- Avatar (choose an emoji or upload a photo).\n- Password (change from Profile page or through password reset).\n\nNote: Your role and email can only be changed by an Admin or Manager.',
        followUp: [
            { label: 'How do I change my avatar?', key: 'avatar_help' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    avatar_help: {
        answer: 'To change your avatar:\n\n1. Go to the Profile page.\n2. In the "Profile Avatar" section, choose from:\n   - Emoji Tab: Pick from 36 emoji options.\n   - Upload Tab: Upload a custom photo.\n3. Click "Save Avatar".\n\nYour avatar appears in the sidebar and anywhere your profile is shown.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    troubleshooting: {
        answer: 'Common issues and fixes:\n\n- Timer not stopping? Refresh the page and try again.\n- Page not loading? Check your internet connection and sign in again.\n- Data looks wrong? Try refreshing or clearing your browser cache.\n- Cannot access a page? Your role may not have permission.\n\nFor persistent issues, contact your Admin.',
        followUp: [
            { label: 'I cannot log in', key: 'login_issues' },
            { label: 'Timer seems stuck', key: 'timer_stuck' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    login_issues: {
        answer: 'If you cannot log in:\n\n1. Double-check your email and password for typos.\n2. Make sure Caps Lock is not on.\n3. Try the "Forgot Password" flow to reset your password.\n4. Your account may be deactivated -- contact your Admin.\n5. Clear your browser cache and try again.',
        followUp: [
            { label: 'Reset my password', key: 'forgot_password' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    timer_stuck: {
        answer: 'If your timer seems stuck:\n\n1. Refresh the page (F5 or Cmd+R).\n2. Check if the timer is still running on the Timer page.\n3. If the stop button does not work, try logging out and back in.\n4. Your timer state is preserved on the server, so no time is lost.\n\nIf the problem persists, contact your Admin.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    admin_help: {
        answer: 'As an Admin or Manager, you can:\n\n- Manage Team: Add, edit, reset passwords, change roles, deactivate users.\n- Manage Projects: Create, edit, add logos, archive projects.\n- Approve Time: Review and approve/reject pending time entries.\n- Export Data: Download CSV reports of all tracked time.\n- View Audit Logs: Monitor all system activity.\n- View Notifications: See system-wide alerts.',
        followUp: [
            { label: 'How do I add a user?', key: 'add_user' },
            { label: 'How do I approve time?', key: 'approve_time' },
            { label: 'Main menu', key: 'menu' },
        ],
    },
    add_user: {
        answer: 'To add a new team member:\n\n1. Go to Team Management from the sidebar.\n2. Click "Add Team Member".\n3. Fill in: First name, Last name, Email, Temporary password, and Role.\n4. Click "Add Member".\n\nThe new user can immediately sign in with the credentials you set.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
    approve_time: {
        answer: 'To approve or reject time entries:\n\n1. Go to the Timesheet page.\n2. Look for entries with "Pending" status.\n3. Click "Approve" or "Reject" for each entry.\n4. The employee will be notified of your decision.\n\nYou can also view all pending approvals in one place.',
        followUp: [{ label: 'Main menu', key: 'menu' }],
    },
};

const mainMenu = [
    { label: 'Getting Started', key: 'getting_started' },
    { label: 'Timer & Clocking In/Out', key: 'clock_in' },
    { label: 'Viewing My Hours', key: 'view_hours' },
    { label: 'Timesheet Approval', key: 'timesheet_approval' },
    { label: 'Projects', key: 'projects' },
    { label: 'My Profile & Avatar', key: 'profile' },
    { label: 'Password Help', key: 'forgot_password' },
    { label: 'Troubleshooting', key: 'troubleshooting' },
];

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
            addMsg('bot', 'Hi there! I am the Web Forx Time Tracker assistant. I can help you with using the app, troubleshooting issues, and finding your way around.');
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

        const keywords: Record<string, string[]> = {
            clock_in: ['clock in', 'start timer', 'begin', 'start work', 'punch in'],
            clock_out: ['clock out', 'stop timer', 'end', 'stop work', 'punch out'],
            forgot_password: ['forgot', 'password', 'reset password', 'cant login', 'locked out'],
            view_hours: ['my hours', 'view time', 'see time', 'tracked time', 'how many hours'],
            export_csv: ['export', 'csv', 'download', 'report'],
            manual_entry: ['manual', 'add time', 'log time', 'backfill'],
            timesheet_approval: ['approval', 'pending', 'approve', 'reject'],
            projects: ['project', 'assign', 'budget'],
            profile: ['profile', 'name', 'email', 'account'],
            avatar_help: ['avatar', 'photo', 'picture', 'emoji'],
            troubleshooting: ['help', 'issue', 'problem', 'error', 'bug', 'broken'],
            timer_stuck: ['stuck', 'frozen', 'not working', 'timer issue'],
            login_issues: ['login', 'sign in', 'cannot access', 'denied'],
            admin_help: ['admin', 'manager', 'manage', 'team', 'users'],
            add_user: ['add user', 'new user', 'create user', 'new member', 'add employee'],
            approve_time: ['approve time', 'review time', 'pending approval'],
        };

        for (const [key, terms] of Object.entries(keywords)) {
            if (terms.some(t => q.includes(t))) {
                const entry = knowledgeBase[key];
                if (entry) {
                    addMsg('bot', entry.answer, entry.followUp);
                    return;
                }
            }
        }

        addMsg('bot', 'I could not find an exact match for your question. Let me show you the available topics:', [
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
