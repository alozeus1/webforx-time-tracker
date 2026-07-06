import React, { useMemo, useState, useEffect } from 'react';
import { Plus, X, Lock, Unlock, Shield, Globe, Palette, TrendingUp, AlertTriangle, CheckCircle2, CircleDashed, Pencil } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { ProjectSummary, UserSummary, IntegrationSummary, AuditLogSummary, NotificationSummary, TeamSummary, TimerCorrectionRequestSummary, TimerPolicySummary } from '../types/api';
import { resolveApiOrigin } from '../utils/apiConfig';

const availableTabs = ['projects', 'budgets', 'teams', 'users', 'integrations', 'notifications', 'corrections', 'policy', 'audit', 'payroll', 'bots', 'compliance', 'branding'] as const;

interface PayrollPeriod {
    id: string;
    period_type: string;
    start_date: string;
    end_date: string;
    status: 'open' | 'locked';
    locked_at: string | null;
    locker: { first_name: string; last_name: string } | null;
}

interface BudgetSummary {
    id: string;
    name: string;
    budget_hours: number | null;
    budget_amount: number | null;
    hours_used: number;
    hours_used_pct: number | null;
    amount_used: number;
    amount_used_pct: number | null;
    over_budget: boolean;
}
const apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_URL, typeof window !== 'undefined' ? window.location : undefined);
const resolveProjectLogoSrc = (logoUrl?: string | null) => {
    if (!logoUrl) {
        return null;
    }

    if (logoUrl.startsWith('data:') || /^https?:\/\//i.test(logoUrl)) {
        return logoUrl;
    }

    return `${apiOrigin}${logoUrl}`;
};

const AUTH_EVENT_LABELS: Record<string, string> = {
    login_attempt: 'Login attempt',
    password_reset_request: 'Reset request',
    password_reset_completion: 'Password reset',
    password_change: 'Password change',
    token_refresh: 'Session refresh',
};

const AUTH_EVENT_REASON_COPY: Record<string, string> = {
    missing_credentials: 'Submitted the sign-in form without both an email and password.',
    user_not_found: 'Used an email address that does not match any account on record.',
    invalid_password: 'Entered the wrong password for this account.',
    account_disabled: 'Tried to sign in while the account was disabled.',
    missing_email: 'Submitted the reset flow without entering an email address.',
    missing_reset_details: 'Submitted the reset form without both a reset code and a new password.',
    password_too_short: 'Tried to set a password shorter than the minimum allowed length.',
    invalid_reset_code: 'Used a reset code that does not exist.',
    used_reset_code: 'Tried to reuse a reset code that had already been consumed.',
    expired_reset_code: 'Used a reset code after it had expired.',
    self_service: 'Changed the password from the profile page.',
    manager_reset: 'An admin or manager updated this password manually.',
    rate_limited: 'Hit the auth rate limit after too many attempts in a short window.',
};

const toTitleCase = (value: string) =>
    value
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');

const getAuditUserPrimary = (log: AuditLogSummary) => {
    const fullName = [log.user?.first_name, log.user?.last_name].filter(Boolean).join(' ').trim();
    return fullName || log.email || log.user?.email || 'Unknown user';
};

const getAuditUserSecondary = (log: AuditLogSummary) => {
    const email = log.email || log.user?.email || null;
    const fullName = [log.user?.first_name, log.user?.last_name].filter(Boolean).join(' ').trim();
    return fullName && email ? email : null;
};

const getAuditActionLabel = (log: AuditLogSummary) =>
    log.source === 'auth'
        ? (AUTH_EVENT_LABELS[log.action] || toTitleCase(log.action))
        : toTitleCase(log.action);

const getAuditDetails = (log: AuditLogSummary) => {
    if (log.source === 'auth') {
        const headline =
            AUTH_EVENT_REASON_COPY[log.reason || '']
            || (log.outcome === 'success' ? 'Completed successfully.' : 'The request was rejected.');

        const parts = ['Authentication'];
        if (log.outcome) {
            parts.push(toTitleCase(log.outcome));
        }

        return {
            headline,
            supporting: parts.join(' • '),
        };
    }

    return {
        headline: toTitleCase(log.resource),
        supporting: null,
    };
};

const Admin: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryTab = searchParams.get('tab');
    const activeTab =
        queryTab && availableTabs.includes(queryTab as (typeof availableTabs)[number])
            ? queryTab
            : 'projects';

    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [teams, setTeams] = useState<TeamSummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([]);
    const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
    const [corrections, setCorrections] = useState<TimerCorrectionRequestSummary[]>([]);
    const [timerPolicy, setTimerPolicy] = useState<TimerPolicySummary | null>(null);
    const [policyFeedback, setPolicyFeedback] = useState<string | null>(null);
    const [teamSavingFor, setTeamSavingFor] = useState<Set<string>>(new Set());
    const [editingRateUserId, setEditingRateUserId] = useState<string | null>(null);
    const [editingRateValue, setEditingRateValue] = useState('');

    // ── Feature 1: Payroll / Timesheet Locking ──────────────────────────────
    const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
    const [payrollLoading, setPayrollLoading] = useState(false);
    const [payrollFeedback, setPayrollFeedback] = useState<string | null>(null);
    const [payrollCadence, setPayrollCadence] = useState<'weekly' | 'biweekly' | 'semimonthly' | 'custom'>('weekly');
    const [payrollAnchor, setPayrollAnchor] = useState(new Date().toISOString().slice(0, 10));
    const [payrollCustomStart, setPayrollCustomStart] = useState('');
    const [payrollCustomEnd, setPayrollCustomEnd] = useState('');

    // ── Feature 2: Bots (Slack / Mattermost / Teams) ────────────────────────
    const [orgSlug, setOrgSlug] = useState('');
    const [slackSigningSecret, setSlackSigningSecret] = useState('');
    const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
    const [slackUserMap, setSlackUserMap] = useState('{}');
    const [slackConfigLoaded, setSlackConfigLoaded] = useState(false);
    const [mmToken, setMmToken] = useState('');
    const [mmIncomingWebhookUrl, setMmIncomingWebhookUrl] = useState('');
    const [mmBotToken, setMmBotToken] = useState('');
    const [mmBaseUrl, setMmBaseUrl] = useState('');
    const [mmUserMap, setMmUserMap] = useState('{}');
    const [mmConfigLoaded, setMmConfigLoaded] = useState(false);
    const [botFeedback, setBotFeedback] = useState<string | null>(null);

    // ── Feature 3+4: Compliance + Rounding ──────────────────────────────────
    const [complianceMode, setComplianceMode] = useState<'none' | 'dcaa' | 'flsa' | 'wtd'>('none');
    const [roundingIncrement, setRoundingIncrement] = useState(15);
    const [roundingDirection, setRoundingDirection] = useState<'nearest' | 'up' | 'down'>('nearest');
    const [complianceLoaded, setComplianceLoaded] = useState(false);
    const [complianceSaving, setComplianceSaving] = useState(false);
    const [complianceFeedback, setComplianceFeedback] = useState<string | null>(null);

    // ── Password policy (stored in org settings alongside compliance) ───────
    const [passwordPolicy, setPasswordPolicy] = useState({
        min_length: 12,
        require_uppercase: false,
        require_lowercase: false,
        require_number: false,
        require_symbol: false,
        expiration_days: 0,
        expiry_warning_days: 7,
    });
    const [passwordPolicySaving, setPasswordPolicySaving] = useState(false);
    const [passwordPolicyFeedback, setPasswordPolicyFeedback] = useState<string | null>(null);

    // ── Feature 5: White-labeling / Branding ────────────────────────────────
    const [branding, setBranding] = useState({ app_name: '', logo_url: '', favicon_url: '', primary_color: '#4F46E5', secondary_color: '#7C3AED', custom_domain: '', email_from_name: '', email_from_address: '' });
    const [brandingLoaded, setBrandingLoaded] = useState(false);
    const [brandingSaving, setBrandingSaving] = useState(false);
    const [brandingFeedback, setBrandingFeedback] = useState<string | null>(null);

    const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
    const [budgetsLoaded, setBudgetsLoaded] = useState(false);
    const [budgetsLoading, setBudgetsLoading] = useState(false);

    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectBudgetHours, setNewProjectBudgetHours] = useState('');
    const [newProjectBudgetAmount, setNewProjectBudgetAmount] = useState('');
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamDesc, setNewTeamDesc] = useState('');
    const [projectLogoPreview, setProjectLogoPreview] = useState<string | null>(null);
    const [projectLogoData, setProjectLogoData] = useState<string | null>(null);
    const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
    const [projectMenuOpen, setProjectMenuOpen] = useState<string | null>(null);
    
    const handleTabChange = (tab: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        });
    };

    async function fetchProjects() {
        try {
            const res = await api.get<ProjectSummary[]>('/projects');
            setProjects(res.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }

    async function fetchUsers() {
        try {
            const res = await api.get<UserSummary[]>('/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }

    async function fetchTeams() {
        try {
            const res = await api.get<{ teams: TeamSummary[] }>('/admin/teams');
            setTeams(res.data.teams || []);
        } catch (error) {
            console.error('Error fetching teams:', error);
        }
    }

    async function fetchIntegrations() {
        try {
            const res = await api.get<{ integrations: IntegrationSummary[] }>('/integrations');
            setIntegrations(res.data.integrations || []);
        } catch (error) {
            console.error('Error fetching integrations:', error);
        }
    }

    async function fetchAuditLogs() {
        try {
            const res = await api.get<{ logs: AuditLogSummary[] }>('/admin/audit-logs');
            setAuditLogs(res.data.logs || []);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        }
    }

    async function fetchNotifications() {
        try {
            const res = await api.get<{ notifications: NotificationSummary[] }>('/admin/notifications');
            setNotifications(res.data.notifications || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }

    async function fetchCorrections() {
        try {
            const res = await api.get<{ corrections: TimerCorrectionRequestSummary[] }>('/timers/corrections/review');
            setCorrections(res.data.corrections || []);
        } catch (error) {
            console.error('Error fetching correction requests:', error);
        }
    }

    async function fetchTimerPolicy() {
        try {
            const res = await api.get<{ policy: TimerPolicySummary }>('/admin/timer-policy');
            setTimerPolicy(res.data.policy);
        } catch (error) {
            console.error('Error fetching timer policy:', error);
        }
    }

    async function handleReviewCorrection(correctionId: string, action: 'approve' | 'reject') {
        const reviewerNote = window.prompt(action === 'approve' ? 'Approval note (optional)' : 'Rejection note (optional)') || '';
        try {
            await api.post(`/timers/corrections/${correctionId}/review`, {
                action,
                reviewer_note: reviewerNote,
            });
            void fetchCorrections();
            void fetchAuditLogs();
        } catch (error) {
            console.error('Error reviewing correction request:', error);
            alert('Failed to review correction request.');
        }
    }

    async function handleSaveTimerPolicy(event: React.FormEvent) {
        event.preventDefault();
        if (!timerPolicy) return;
        setPolicyFeedback(null);
        try {
            const res = await api.put<{ policy: TimerPolicySummary }>('/admin/timer-policy', timerPolicy);
            setTimerPolicy(res.data.policy);
            setPolicyFeedback('Timer policy saved.');
            void fetchAuditLogs();
        } catch (error) {
            console.error('Error saving timer policy:', error);
            setPolicyFeedback('Failed to save timer policy.');
        }
    }

    // ── Payroll functions ────────────────────────────────────────────────────
    async function fetchPayrollPeriods() {
        setPayrollLoading(true);
        try {
            const res = await api.get<{ periods: PayrollPeriod[] }>('/payroll');
            setPayrollPeriods(res.data.periods || []);
        } catch (error) {
            console.error('Error fetching payroll periods:', error);
        } finally {
            setPayrollLoading(false);
        }
    }

    async function handleGeneratePeriod() {
        setPayrollFeedback(null);
        try {
            const body: Record<string, string> = { cadence: payrollCadence };
            if (payrollCadence === 'custom') {
                body.start_date = payrollCustomStart;
                body.end_date = payrollCustomEnd;
            } else {
                body.anchor_date = payrollAnchor;
            }
            await api.post('/payroll/generate', body);
            setPayrollFeedback('Period generated.');
            void fetchPayrollPeriods();
        } catch {
            setPayrollFeedback('Failed to generate period.');
        }
    }

    async function handleLockPeriod(id: string) {
        try {
            await api.post(`/payroll/${id}/lock`);
            void fetchPayrollPeriods();
        } catch { alert('Failed to lock period.'); }
    }

    async function handleUnlockPeriod(id: string) {
        const notes = window.prompt('Unlock reason (optional)') ?? '';
        try {
            await api.post(`/payroll/${id}/unlock`, { notes });
            void fetchPayrollPeriods();
        } catch { alert('Failed to unlock period.'); }
    }

    // ── Bot config functions ─────────────────────────────────────────────────
    async function fetchBotsConfig() {
        // Fetch org slug alongside bot configs so we can show the real callback URL
        // GET /organizations returns array scoped to current org for Admins
        const orgRes = await api.get<Array<{ slug?: string }>>('/organizations').catch(() => null);
        const slug = Array.isArray(orgRes?.data) ? orgRes.data[0]?.slug : (orgRes?.data as { slug?: string } | undefined)?.slug;
        if (slug) setOrgSlug(slug);

        const [slackRes, mmRes] = await Promise.allSettled([
            api.get<{ webhook_url?: string; user_map?: Record<string, string> }>('/bots/slack/config'),
            api.get<{ user_map?: Record<string, string>; incoming_webhook_url_set?: boolean; bot_token_set?: boolean; mattermost_base_url?: string }>('/bots/mattermost/config'),
        ]);
        if (slackRes.status === 'fulfilled') {
            const d = slackRes.value.data;
            setSlackWebhookUrl(d.webhook_url || '');
            setSlackUserMap(JSON.stringify(d.user_map || {}, null, 2));
            setSlackConfigLoaded(true);
        } else {
            setSlackConfigLoaded(true);
        }
        if (mmRes.status === 'fulfilled') {
            const d = mmRes.value.data;
            setMmUserMap(JSON.stringify(d.user_map || {}, null, 2));
            if (d.incoming_webhook_url_set) setMmIncomingWebhookUrl('••••••••');
            if (d.bot_token_set) setMmBotToken('••••••••');
            if (d.mattermost_base_url) setMmBaseUrl(d.mattermost_base_url);
            setMmConfigLoaded(true);
        } else {
            setMmConfigLoaded(true);
        }
    }

    async function handleSaveSlack(e: React.FormEvent) {
        e.preventDefault();
        setBotFeedback(null);
        let userMap: Record<string, string>;
        try { userMap = JSON.parse(slackUserMap); } catch { setBotFeedback('Slack user map is not valid JSON.'); return; }
        try {
            await api.put('/bots/slack/config', { signing_secret: slackSigningSecret || undefined, webhook_url: slackWebhookUrl || undefined, user_map: userMap });
            setBotFeedback('Slack bot saved.');
            setSlackSigningSecret('');
        } catch { setBotFeedback('Failed to save Slack config.'); }
    }

    async function handleSaveMattermost(e: React.FormEvent) {
        e.preventDefault();
        setBotFeedback(null);
        let userMap: Record<string, string>;
        try { userMap = JSON.parse(mmUserMap); } catch { setBotFeedback('Mattermost user map is not valid JSON.'); return; }
        try {
            const mmPayload: Record<string, unknown> = { user_map: userMap };
            if (mmToken) mmPayload.token = mmToken;
            // Only send secrets if they're a real value (not the masked placeholder)
            if (mmIncomingWebhookUrl && !mmIncomingWebhookUrl.startsWith('•')) {
                mmPayload.incoming_webhook_url = mmIncomingWebhookUrl;
            }
            if (mmBotToken && !mmBotToken.startsWith('•')) {
                mmPayload.bot_token = mmBotToken;
            }
            if (mmBaseUrl) mmPayload.mattermost_base_url = mmBaseUrl;
            await api.put('/bots/mattermost/config', mmPayload);
            setBotFeedback('Mattermost bot saved.');
            setMmToken('');
            setMmBotToken('');
        } catch { setBotFeedback('Failed to save Mattermost config.'); }
    }

    // ── Compliance + Rounding functions ──────────────────────────────────────
    async function fetchComplianceSettings() {
        try {
            const res = await api.get<{ compliance_mode?: string; time_rounding?: { increment: number; direction: string } | null; password_policy?: typeof passwordPolicy }>('/admin/org-settings');
            setComplianceMode((res.data.compliance_mode || 'none') as 'none' | 'dcaa' | 'flsa' | 'wtd');
            if (res.data.time_rounding) {
                setRoundingIncrement(res.data.time_rounding.increment || 15);
                setRoundingDirection((res.data.time_rounding.direction || 'nearest') as 'nearest' | 'up' | 'down');
            }
            if (res.data.password_policy) {
                setPasswordPolicy(prev => ({ ...prev, ...res.data.password_policy }));
            }
        } catch (error) {
            console.error('Error fetching compliance settings:', error);
        } finally {
            setComplianceLoaded(true);
        }
    }

    async function handleSaveCompliance() {
        setComplianceSaving(true);
        setComplianceFeedback(null);
        try {
            await api.put('/admin/org-settings', { compliance_mode: complianceMode, time_rounding: { increment: roundingIncrement, direction: roundingDirection } });
            setComplianceFeedback('Settings saved.');
        } catch {
            setComplianceFeedback('Failed to save settings.');
        } finally {
            setComplianceSaving(false);
        }
    }

    async function handleSavePasswordPolicy() {
        setPasswordPolicySaving(true);
        setPasswordPolicyFeedback(null);
        try {
            await api.put('/admin/org-settings', { password_policy: passwordPolicy });
            setPasswordPolicyFeedback('Password policy saved.');
        } catch {
            setPasswordPolicyFeedback('Failed to save password policy.');
        } finally {
            setPasswordPolicySaving(false);
        }
    }

    // ── Branding functions ────────────────────────────────────────────────────
    async function fetchBudgets() {
        setBudgetsLoading(true);
        try {
            const res = await api.get<{ budgets: BudgetSummary[] }>('/projects/budgets');
            setBudgets(res.data.budgets);
        } catch (error) {
            console.error('Error fetching budgets:', error);
        } finally {
            setBudgetsLoaded(true);
            setBudgetsLoading(false);
        }
    }

    async function fetchBrandingSettings() {
        try {
            const res = await api.get<{ app_name?: string; logo_url?: string; favicon_url?: string; primary_color?: string; secondary_color?: string; custom_domain?: string; email_from_name?: string; email_from_address?: string } | null>('/branding');
            if (res.data) {
                setBranding({
                    app_name: res.data.app_name || '',
                    logo_url: res.data.logo_url || '',
                    favicon_url: res.data.favicon_url || '',
                    primary_color: res.data.primary_color || '#4F46E5',
                    secondary_color: res.data.secondary_color || '#7C3AED',
                    custom_domain: res.data.custom_domain || '',
                    email_from_name: res.data.email_from_name || '',
                    email_from_address: res.data.email_from_address || '',
                });
            }
        } catch (error) {
            console.error('Error fetching branding:', error);
        } finally {
            setBrandingLoaded(true);
        }
    }

    async function handleSaveBranding(e: React.FormEvent) {
        e.preventDefault();
        setBrandingSaving(true);
        setBrandingFeedback(null);
        try {
            await api.put('/branding', branding);
            setBrandingFeedback('Branding saved.');
        } catch {
            setBrandingFeedback('Failed to save branding.');
        } finally {
            setBrandingSaving(false);
        }
    }

    async function handleResetBranding() {
        if (!window.confirm('Reset branding to defaults?')) return;
        try {
            await api.delete('/branding');
            setBranding({ app_name: '', logo_url: '', favicon_url: '', primary_color: '#4F46E5', secondary_color: '#7C3AED', custom_domain: '', email_from_name: '', email_from_address: '' });
            setBrandingFeedback('Branding reset to defaults.');
        } catch {
            setBrandingFeedback('Failed to reset branding.');
        }
    }

    async function handleDeleteNotification(notificationId: string) {
        try {
            await api.delete(`/admin/notifications/${notificationId}`);
            setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    }

    async function handleUpdateUserTeam(user: UserSummary, teamName: string) {
        setTeamSavingFor((current) => new Set(current).add(user.id));

        try {
            await api.put(`/users/${user.id}`, {
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                team_name: teamName === 'unassigned' ? null : teamName,
            });
            setUsers((current) => current.map((item) => (
                item.id === user.id
                    ? { ...item, team_name: teamName === 'unassigned' ? null : teamName }
                    : item
            )));
        } catch (error) {
            console.error('Error updating user team:', error);
            alert('Failed to update user team.');
        } finally {
            setTeamSavingFor((current) => {
                const next = new Set(current);
                next.delete(user.id);
                return next;
            });
        }
    }

    async function handleSaveRate(userId: string) {
        const rate = parseFloat(editingRateValue);
        if (isNaN(rate) || rate < 0) { alert('Enter a valid rate (0 or higher).'); return; }
        try {
            await api.put(`/users/${userId}`, { hourly_rate: rate });
            setUsers(current => current.map(u => u.id === userId ? { ...u, hourly_rate: rate } : u));
            setEditingRateUserId(null);
        } catch {
            alert('Failed to save billing rate.');
        }
    }

    async function handleCreateTeam(event: React.FormEvent) {
        event.preventDefault();
        const name = newTeamName.trim();
        if (!name) return;

        try {
            await api.post('/admin/teams', {
                name,
                description: newTeamDesc.trim() || null,
            });
            setNewTeamName('');
            setNewTeamDesc('');
            void fetchTeams();
            void fetchAuditLogs();
        } catch (error) {
            console.error('Error creating team:', error);
            alert('Failed to create team.');
        }
    }

    async function handleToggleTeam(team: TeamSummary) {
        try {
            await api.put(`/admin/teams/${team.id}`, { is_active: !team.is_active });
            void fetchTeams();
            void fetchAuditLogs();
        } catch (error) {
            console.error('Error updating team:', error);
            alert('Failed to update team.');
        }
    }

    useEffect(() => {
        const loadAdminData = async () => {
            await Promise.all([
                fetchProjects(),
                fetchTeams(),
                fetchUsers(),
                fetchIntegrations(),
                fetchAuditLogs(),
                fetchNotifications(),
                fetchCorrections(),
                fetchTimerPolicy(),
            ]);
        };
        void loadAdminData();
    }, []);

    // Lazy-load new tab data on first visit
    useEffect(() => {
        if (activeTab === 'payroll') void fetchPayrollPeriods();
        if (activeTab === 'bots' && !slackConfigLoaded) void fetchBotsConfig();
        if (activeTab === 'compliance' && !complianceLoaded) void fetchComplianceSettings();
        if (activeTab === 'branding' && !brandingLoaded) void fetchBrandingSettings();
        if (activeTab === 'budgets' && !budgetsLoaded) void fetchBudgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const userCounts = useMemo(() => {
        const active = users.filter((user) => user.is_active).length;
        const inactive = users.length - active;
        const assigned = users.filter((user) => user.team_name?.trim()).length;

        return {
            total: users.length,
            active,
            inactive,
            assigned,
            unassigned: users.length - assigned,
        };
    }, [users]);

    const teamOptions = useMemo(() => {
        const values = new Set(teams.filter((team) => team.is_active).map((team) => team.name));
        users.forEach((user) => {
            if (user.team_name?.trim()) {
                values.add(user.team_name.trim());
            }
        });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [teams, users]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert('Logo must be under 2MB');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            setProjectLogoPreview(result);
            setProjectLogoData(result);
        };
        reader.readAsDataURL(file);
    };

    const resetProjectForm = () => {
        setIsProjectModalOpen(false);
        setEditingProject(null);
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectBudgetHours('');
        setNewProjectBudgetAmount('');
        setProjectLogoPreview(null);
        setProjectLogoData(null);
    };

    const openEditProject = (project: ProjectSummary) => {
        setEditingProject(project);
        setNewProjectName(project.name);
        setNewProjectDesc(project.description || '');
        setNewProjectBudgetHours(project.budget_hours?.toString() || '');
        setNewProjectBudgetAmount(project.budget_amount?.toString() || '');
        setProjectLogoPreview(resolveProjectLogoSrc(project.logo_url));
        setProjectLogoData(null);
        setIsProjectModalOpen(true);
        setProjectMenuOpen(null);
    };

    const handleDeleteProject = async (project: ProjectSummary) => {
        if (!window.confirm(`Archive project "${project.name}"? This will deactivate it.`)) return;
        try {
            await api.delete(`/projects/${project.id}`);
            void fetchProjects();
            void fetchBudgets();
            setProjectMenuOpen(null);
        } catch {
            alert('Failed to archive project.');
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: newProjectName,
                description: newProjectDesc,
                budget_hours: newProjectBudgetHours,
                budget_amount: newProjectBudgetAmount,
                logo_data: projectLogoData || undefined,
            };

            if (editingProject) {
                await api.put(`/projects/${editingProject.id}`, payload);
            } else {
                await api.post('/projects', payload);
            }
            resetProjectForm();
            void fetchProjects();
            void fetchBudgets();
        } catch (error) {
            console.error('Error saving project:', error);
            alert('Failed to save project.');
        }
    };

    return (
        <div className="flex-1 flex w-full flex-col overflow-y-auto bg-slate-50">
            <div className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
                <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-slate-900 dark:text-white text-3xl font-black leading-tight tracking-tight">Organization Management</h1>
                        <p className="text-slate-500 text-base font-normal">Configure and monitor your organization's infrastructure, team, and security.</p>
                    </div>
                    {activeTab === 'projects' && (
                        <button
                            type="button"
                            onClick={() => setIsProjectModalOpen(true)}
                            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            <Plus size={16} />
                            Create New Project
                        </button>
                    )}
                    {activeTab === 'users' && (
                        <Link
                            to="/team"
                            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            <span className="material-symbols-outlined text-base">groups</span>
                            Open Team Management
                        </Link>
                    )}
                    {activeTab === 'teams' && (
                        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void handleCreateTeam(event)}>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Team Name
                                <input
                                    type="text"
                                    value={newTeamName}
                                    onChange={(event) => setNewTeamName(event.target.value)}
                                    placeholder="DevSecOps"
                                    className="mt-1 w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Description
                                <input
                                    type="text"
                                    value={newTeamDesc}
                                    onChange={(event) => setNewTeamDesc(event.target.value)}
                                    placeholder="Optional"
                                    className="mt-1 w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                            <button
                                type="submit"
                                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                            >
                                <Plus size={16} />
                                Create Team
                            </button>
                        </form>
                    )}
                </div>

                <div className="mb-6">
                    <div className="relative">
                    <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8 overflow-x-auto scrollbar-hide" style={{scrollbarWidth:'none', msOverflowStyle:'none'}}>
                    <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
                        {availableTabs.map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => handleTabChange(tab)}
                                className={`flex flex-col items-center justify-center border-b-2 pb-3 transition-all whitespace-nowrap ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <p className="text-sm font-bold leading-normal capitalize">{
                                    tab === 'audit' ? 'Audit Logs' :
                                    tab === 'payroll' ? 'Payroll Periods' :
                                    tab === 'bots' ? 'Bot Integrations' :
                                    tab === 'compliance' ? 'Compliance' :
                                    tab === 'branding' ? 'Branding' :
                                    tab === 'budgets' ? 'Budgets' :
                                    tab
                                }</p>
                            </button>
                        ))}
                    </div>
                    {/* Right-edge fade to signal more tabs are scrollable */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white dark:from-slate-900 to-transparent" />
                    </div>
                </div>

                {activeTab === 'users' && (
                    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                            ['Total Users', userCounts.total, 'All accounts'],
                            ['Active Users', userCounts.active, 'Can sign in'],
                            ['Inactive Users', userCounts.inactive, 'Access disabled'],
                            ['Assigned to Teams', userCounts.assigned, 'Grouped for reports'],
                            ['Unassigned', userCounts.unassigned, 'Needs team/group'],
                        ].map(([label, value, caption]) => (
                            <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                                <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
                                <p className="mt-1 text-xs text-slate-500">{caption}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══════════ PAYROLL / TIMESHEET LOCKING TAB ═══════════ */}
                {activeTab === 'payroll' && (
                    <div className="space-y-6">
                        {/* Generate form */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                                <Lock size={16} className="text-primary" /> Generate Payroll Period
                            </h3>
                            <div className="flex flex-wrap gap-4 items-end">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Cadence
                                    <select value={payrollCadence} onChange={e => setPayrollCadence(e.target.value as typeof payrollCadence)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                                        <option value="weekly">Weekly</option>
                                        <option value="biweekly">Bi-weekly</option>
                                        <option value="semimonthly">Semi-monthly</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </label>
                                {payrollCadence !== 'custom' ? (
                                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Anchor Date
                                        <input type="date" value={payrollAnchor} onChange={e => setPayrollAnchor(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                    </label>
                                ) : (
                                    <>
                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            Start Date
                                            <input type="date" value={payrollCustomStart} onChange={e => setPayrollCustomStart(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                        </label>
                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            End Date
                                            <input type="date" value={payrollCustomEnd} onChange={e => setPayrollCustomEnd(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                        </label>
                                    </>
                                )}
                                <button type="button" onClick={() => void handleGeneratePeriod()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">
                                    <Plus size={16} /> Generate
                                </button>
                            </div>
                            {payrollFeedback && <p className="mt-3 text-sm font-medium text-primary">{payrollFeedback}</p>}
                        </div>

                        {/* Periods list */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50">
                                <h3 className="font-bold text-slate-900 dark:text-white">Payroll Periods</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                                            <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Type</th>
                                            <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Period</th>
                                            <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                            <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Locked by</th>
                                            <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {payrollLoading && <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">Loading…</td></tr>}
                                        {!payrollLoading && payrollPeriods.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">No payroll periods yet. Generate one above.</td></tr>}
                                        {!payrollLoading && payrollPeriods.map(p => (
                                            <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                                <td className="px-6 py-4 text-sm capitalize text-slate-700 dark:text-slate-300">{p.period_type}</td>
                                                <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                                                    {new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${p.status === 'locked' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                                        {p.status === 'locked' ? <Lock size={11} /> : <Unlock size={11} />}
                                                        {p.status === 'locked' ? 'Locked' : 'Open'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-500">
                                                    {p.status === 'locked' && p.locker ? `${p.locker.first_name} ${p.locker.last_name}` : '—'}
                                                    {p.status === 'locked' && p.locked_at ? ` · ${new Date(p.locked_at).toLocaleDateString()}` : ''}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {p.status === 'open' ? (
                                                        <button type="button" onClick={() => void handleLockPeriod(p.id)} className="text-xs font-bold text-rose-600 hover:text-rose-800">Lock</button>
                                                    ) : (
                                                        <button type="button" onClick={() => void handleUnlockPeriod(p.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">Unlock</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════ BOTS TAB ═══════════ */}
                {activeTab === 'bots' && (
                    <div className="space-y-6">
                        {botFeedback && (
                            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${botFeedback.includes('Failed') || botFeedback.includes('not valid') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {botFeedback}
                            </div>
                        )}

                        {/* Slack */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-lg text-[#4A154B]">chat</span> Slack Bot
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">Slash command endpoint: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{`POST /api/v1/bots/slack/<org-slug>`}</code></p>
                            <form onSubmit={(e) => void handleSaveSlack(e)} className="grid gap-4 md:grid-cols-2">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Signing Secret (leave blank to keep existing)
                                    <input type="password" value={slackSigningSecret} onChange={e => setSlackSigningSecret(e.target.value)} placeholder="xoxb-..." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Incoming Webhook URL (optional)
                                    <input type="url" value={slackWebhookUrl} onChange={e => setSlackWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/..." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                                    User Map (JSON: Slack user ID → App user ID)
                                    <textarea rows={4} value={slackUserMap} onChange={e => setSlackUserMap(e.target.value)} placeholder='{"U123456": "app-user-uuid"}' className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                </label>
                                <div className="md:col-span-2">
                                    <button type="submit" disabled={!slackConfigLoaded} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                                        Save Slack Config
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Mattermost */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-lg text-blue-600">forum</span> Mattermost Bot
                            </h3>
                            {orgSlug && (
                                <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-1">
                                    <p className="font-semibold text-slate-700">Your callback URL (paste this into Mattermost)</p>
                                    <code className="block rounded bg-white border border-slate-200 px-2 py-1 text-[11px] select-all break-all">
                                        {`${(api.defaults.baseURL ?? '').replace(/\/api\/v1\/?$/, '')}/api/v1/bots/mattermost/${orgSlug}`}
                                    </code>
                                    <p className="text-[10px] text-slate-400">Your org slug is <strong>{orgSlug}</strong> — use this for both Slash Commands and Outgoing Webhooks in Mattermost</p>
                                </div>
                            )}
                            <p className="text-xs text-slate-400 mb-3">
                                Two separate webhook directions — configure both or either depending on your use case.
                            </p>
                            <form onSubmit={(e) => void handleSaveMattermost(e)} className="grid gap-4 md:grid-cols-2">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Outgoing Webhook Token (leave blank to keep existing)
                                    <input type="password" value={mmToken} onChange={e => setMmToken(e.target.value)} placeholder="token" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                    <span className="block mt-1 text-[10px] font-normal normal-case text-slate-400">Token from Mattermost Slash Command config — verifies /timer commands are from your server</span>
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Incoming Webhook URL (leave blank to keep existing)
                                    <input
                                        type="url"
                                        value={mmIncomingWebhookUrl}
                                        onChange={e => setMmIncomingWebhookUrl(e.target.value)}
                                        onFocus={e => { if (e.target.value.startsWith('•')) setMmIncomingWebhookUrl(''); }}
                                        placeholder="https://mattermost.yourcompany.com/hooks/xxxx"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                    <span className="block mt-1 text-[10px] font-normal normal-case text-slate-400">Posts leave request alerts to a Mattermost channel — created under Integrations → Incoming Webhooks</span>
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Mattermost Server URL
                                    <input
                                        type="url"
                                        value={mmBaseUrl}
                                        onChange={e => setMmBaseUrl(e.target.value)}
                                        placeholder="https://mattermost.yourcompany.com"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                    <span className="block mt-1 text-[10px] font-normal normal-case text-slate-400">Your Mattermost server base URL — required for Bot Token features (DMs, user auto-link)</span>
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Bot Token (leave blank to keep existing)
                                    <input
                                        type="password"
                                        value={mmBotToken}
                                        onChange={e => setMmBotToken(e.target.value)}
                                        onFocus={e => { if (e.target.value.startsWith('•')) setMmBotToken(''); }}
                                        placeholder="bot-token-from-mattermost"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                    <span className="block mt-1 text-[10px] font-normal normal-case text-slate-400">Bot Account token from Mattermost — enables email-based user auto-linking and DMs on leave decisions</span>
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                                    User Map JSON <span className="text-[10px] font-normal text-slate-400 normal-case">(optional — only needed if emails differ between systems)</span>
                                    <textarea rows={3} value={mmUserMap} onChange={e => setMmUserMap(e.target.value)} placeholder='{}' className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                    <span className="block mt-1 text-[10px] font-normal normal-case text-slate-400">Manual override: <code>{"{"}"mattermost-user-id": "timer-app-user-uuid"{"}"}</code>. Leave as <code>{"{}"}</code> if Mattermost and Timer emails match — the Bot Token will auto-resolve users.</span>
                                </label>
                                <div className="md:col-span-2">
                                    <button type="submit" disabled={!mmConfigLoaded} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                                        Save Mattermost Config
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Teams (stub) */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 opacity-60">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-lg text-indigo-600">groups</span> Microsoft Teams
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">Coming Soon</span>
                            </h3>
                            <p className="text-sm text-slate-500">Teams integration is wired and ready to activate. Contact support when you are ready to configure your Teams bot endpoint.</p>
                        </div>
                    </div>
                )}

                {/* ═══════════ COMPLIANCE TAB (incl. rounding) ═══════════ */}
                {activeTab === 'compliance' && (
                    <div className="space-y-6">
                        {complianceFeedback && (
                            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${complianceFeedback.includes('Failed') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {complianceFeedback}
                            </div>
                        )}

                        {/* Compliance mode */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                                <Shield size={16} className="text-primary" /> Compliance Mode
                            </h3>
                            <p className="text-xs text-slate-500 mb-5">Enforce regulatory requirements across all time entries for this organisation.</p>
                            {!complianceLoaded ? (
                                <p className="text-sm text-slate-500">Loading…</p>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    {([
                                        { mode: 'none', label: 'None', icon: '⭕', desc: 'No compliance restrictions.' },
                                        { mode: 'dcaa', label: 'DCAA', icon: '🏛️', desc: 'Locks approved entries. Required for US government contractors.' },
                                        { mode: 'flsa', label: 'FLSA', icon: '⚖️', desc: 'Flags overtime after 40h/week for non-exempt employees.' },
                                        { mode: 'wtd', label: 'WTD', icon: '🇬🇧', desc: 'Alerts when 17-week average exceeds 48h (UK Working Time Directive).' },
                                    ] as const).map(({ mode, label, icon, desc }) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setComplianceMode(mode)}
                                            className={`rounded-xl border-2 p-4 text-left transition-all ${complianceMode === mode ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary/40'}`}
                                        >
                                            <div className="text-2xl mb-2">{icon}</div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-black text-slate-900 dark:text-white text-sm">{label}</span>
                                                {complianceMode === mode && <span className="material-symbols-outlined text-primary text-sm">check_circle</span>}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Time rounding */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-base text-primary">schedule</span> Time Rounding Rules
                            </h3>
                            <p className="text-xs text-slate-500 mb-5">Applied automatically to start and end times on manual entries and timer stops.</p>
                            <div className="flex flex-wrap gap-6 items-end">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Round to nearest (minutes)
                                    <select value={roundingIncrement} onChange={e => setRoundingIncrement(Number(e.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                                        {[1, 5, 6, 10, 12, 15, 30, 60].map(n => <option key={n} value={n}>{n} min</option>)}
                                    </select>
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Direction
                                    <select value={roundingDirection} onChange={e => setRoundingDirection(e.target.value as typeof roundingDirection)} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                                        <option value="nearest">Nearest</option>
                                        <option value="up">Always round up</option>
                                        <option value="down">Always round down</option>
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    disabled={complianceSaving}
                                    onClick={() => void handleSaveCompliance()}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {complianceSaving ? 'Saving…' : 'Save Settings'}
                                </button>
                            </div>
                        </div>

                        {/* Password policy */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-base text-primary">password</span> Password Policy
                            </h3>
                            <p className="text-xs text-slate-500 mb-5">Requirements enforced when users set or reset their password. Expiration of 0 days means passwords never expire.</p>
                            {!complianceLoaded ? (
                                <p className="text-sm text-slate-500">Loading…</p>
                            ) : (
                                <div className="space-y-5">
                                    <div className="flex flex-wrap gap-6 items-end">
                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            Minimum length (8–128)
                                            <input
                                                type="number"
                                                min={8}
                                                max={128}
                                                value={passwordPolicy.min_length}
                                                onChange={e => setPasswordPolicy(p => ({ ...p, min_length: Number(e.target.value) }))}
                                                className="mt-1 block w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            />
                                        </label>
                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                            Password expiration (days, 0 = never)
                                            <input
                                                type="number"
                                                min={0}
                                                max={3650}
                                                value={passwordPolicy.expiration_days}
                                                onChange={e => setPasswordPolicy(p => ({ ...p, expiration_days: Number(e.target.value) }))}
                                                className="mt-1 block w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                            />
                                        </label>
                                        <label className={`text-xs font-bold uppercase tracking-wide text-slate-500 ${passwordPolicy.expiration_days <= 0 ? 'opacity-50' : ''}`}>
                                            Warn users N days before expiry (1–90)
                                            <input
                                                type="number"
                                                min={1}
                                                max={90}
                                                disabled={passwordPolicy.expiration_days <= 0}
                                                value={passwordPolicy.expiry_warning_days}
                                                onChange={e => setPasswordPolicy(p => ({ ...p, expiry_warning_days: Number(e.target.value) }))}
                                                className="mt-1 block w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed"
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {([
                                            { key: 'require_uppercase', label: 'Require uppercase letter' },
                                            { key: 'require_lowercase', label: 'Require lowercase letter' },
                                            { key: 'require_number', label: 'Require number' },
                                            { key: 'require_symbol', label: 'Require symbol' },
                                        ] as const).map(({ key, label }) => (
                                            <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={passwordPolicy[key]}
                                                    onChange={e => setPasswordPolicy(p => ({ ...p, [key]: e.target.checked }))}
                                                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            disabled={passwordPolicySaving}
                                            onClick={() => void handleSavePasswordPolicy()}
                                            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {passwordPolicySaving ? 'Saving…' : 'Save Password Policy'}
                                        </button>
                                        {passwordPolicyFeedback && (
                                            <span className={`text-sm font-medium ${passwordPolicyFeedback.includes('Failed') ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {passwordPolicyFeedback}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════ BRANDING TAB ═══════════ */}
                {activeTab === 'branding' && (
                    <div className="space-y-6">
                        {brandingFeedback && (
                            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${brandingFeedback.includes('Failed') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {brandingFeedback}
                            </div>
                        )}
                        {!brandingLoaded ? (
                            <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
                        ) : (
                            <div className="grid gap-6 lg:grid-cols-3">
                                <div className="lg:col-span-2">
                                    <form onSubmit={(e) => void handleSaveBranding(e)} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <Palette size={16} className="text-primary" /> White-label Branding
                                        </h3>

                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                App / Product Name
                                                <input type="text" value={branding.app_name} onChange={e => setBranding(b => ({ ...b, app_name: e.target.value }))} placeholder="Acme Time Tracker" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Custom Domain
                                                <div className="mt-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                                                    <Globe size={13} className="text-slate-400 shrink-0" />
                                                    <input type="text" value={branding.custom_domain} onChange={e => setBranding(b => ({ ...b, custom_domain: e.target.value }))} placeholder="time.acme.com" className="w-full text-sm text-slate-900 outline-none bg-transparent" />
                                                </div>
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Logo URL
                                                <input type="url" value={branding.logo_url} onChange={e => setBranding(b => ({ ...b, logo_url: e.target.value }))} placeholder="https://cdn.acme.com/logo.png" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Favicon URL
                                                <input type="url" value={branding.favicon_url} onChange={e => setBranding(b => ({ ...b, favicon_url: e.target.value }))} placeholder="https://cdn.acme.com/favicon.ico" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Primary Colour
                                                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                                                    <input type="color" value={branding.primary_color} onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))} className="h-6 w-10 cursor-pointer rounded border-0 p-0" />
                                                    <input type="text" value={branding.primary_color} onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))} maxLength={7} className="w-24 text-sm font-mono text-slate-900 outline-none" />
                                                </div>
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Secondary Colour
                                                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                                                    <input type="color" value={branding.secondary_color} onChange={e => setBranding(b => ({ ...b, secondary_color: e.target.value }))} className="h-6 w-10 cursor-pointer rounded border-0 p-0" />
                                                    <input type="text" value={branding.secondary_color} onChange={e => setBranding(b => ({ ...b, secondary_color: e.target.value }))} maxLength={7} className="w-24 text-sm font-mono text-slate-900 outline-none" />
                                                </div>
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Email From Name
                                                <input type="text" value={branding.email_from_name} onChange={e => setBranding(b => ({ ...b, email_from_name: e.target.value }))} placeholder="Acme Notifications" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                            </label>
                                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                Email From Address
                                                <input type="email" value={branding.email_from_address} onChange={e => setBranding(b => ({ ...b, email_from_address: e.target.value }))} placeholder="no-reply@acme.com" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                            </label>
                                        </div>

                                        <div className="flex gap-3 pt-2">
                                            <button type="submit" disabled={brandingSaving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                                                {brandingSaving ? 'Saving…' : 'Save Branding'}
                                            </button>
                                            <button type="button" onClick={() => void handleResetBranding()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
                                                Reset to Defaults
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Preview card */}
                                <div className="lg:col-span-1">
                                    <div className="sticky top-6 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                        <div className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">Preview</div>
                                        <div className="p-5 bg-white dark:bg-slate-800 space-y-4">
                                            <div className="flex items-center gap-3">
                                                {branding.logo_url ? (
                                                    <img src={branding.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain border border-slate-200" onError={e => (e.currentTarget.style.display='none')} />
                                                ) : (
                                                    <div className="h-10 w-10 rounded-lg flex items-center justify-center font-black text-white text-xs" style={{ backgroundColor: branding.primary_color }}>
                                                        {(branding.app_name || 'WFX').slice(0, 3).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="font-black text-slate-900 dark:text-white">{branding.app_name || 'Web Forx Time'}</span>
                                            </div>
                                            <div className="rounded-lg p-3 text-white text-xs font-bold" style={{ backgroundColor: branding.primary_color }}>
                                                Primary button
                                            </div>
                                            <div className="rounded-lg p-3 text-white text-xs font-bold" style={{ backgroundColor: branding.secondary_color }}>
                                                Secondary button
                                            </div>
                                            {branding.custom_domain && (
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Globe size={11} /> {branding.custom_domain}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════ BUDGETS TAB ═══════════ */}
                {activeTab === 'budgets' && (
                    <div className="space-y-6 mb-8">
                        {budgetsLoading && !budgetsLoaded ? (
                            <div className="text-center py-16 text-slate-400">Loading budget data…</div>
                        ) : (
                            <>
                                {/* Summary cards */}
                                {(() => {
                                    const overBudget = budgets.filter(b => b.over_budget).length;
                                    const onTrack = budgets.filter(b => !b.over_budget && (b.budget_hours || b.budget_amount)).length;
                                    const noBudget = budgets.filter(b => !b.budget_hours && !b.budget_amount).length;
                                    return (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Total Projects', value: budgets.length, icon: <TrendingUp size={18} />, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
                                                { label: 'Over Budget', value: overBudget, icon: <AlertTriangle size={18} />, color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' },
                                                { label: 'On Track', value: onTrack, icon: <CheckCircle2 size={18} />, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
                                                { label: 'No Budget Set', value: noBudget, icon: <CircleDashed size={18} />, color: 'text-slate-500 bg-slate-100 dark:bg-slate-700' },
                                            ].map(card => (
                                                <div key={card.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-4">
                                                    <div className={`p-2 rounded-lg ${card.color}`}>{card.icon}</div>
                                                    <div>
                                                        <p className="text-2xl font-black text-slate-900 dark:text-white">{card.value}</p>
                                                        <p className="text-xs text-slate-500">{card.label}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {/* Budget table */}
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                        <h3 className="font-bold text-slate-900 dark:text-white">Project Budget Health</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Hours and cost burn against each project's set budget. Edit a project to update its budget.</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Project</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Hours Used</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400">Cost Used</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                                    <th className="px-6 py-3 text-xs font-bold uppercase text-slate-400"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                {budgets.length === 0 ? (
                                                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">No projects found.</td></tr>
                                                ) : budgets.map(b => {
                                                    const hPct = Math.min(b.hours_used_pct ?? 0, 100);
                                                    const aPct = Math.min(b.amount_used_pct ?? 0, 100);
                                                    const noBudget = !b.budget_hours && !b.budget_amount;
                                                    const statusColor = b.over_budget ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/20' :
                                                        noBudget ? 'text-slate-500 bg-slate-100 dark:bg-slate-700' :
                                                        ((b.hours_used_pct ?? 0) >= 80 || (b.amount_used_pct ?? 0) >= 80) ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' :
                                                        'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
                                                    const statusLabel = b.over_budget ? 'Over Budget' : noBudget ? 'No Budget' :
                                                        ((b.hours_used_pct ?? 0) >= 80 || (b.amount_used_pct ?? 0) >= 80) ? 'Near Limit' : 'On Track';
                                                    return (
                                                        <tr key={b.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors ${b.over_budget ? 'bg-rose-50/30 dark:bg-rose-900/10' : ''}`}>
                                                            <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-sm">{b.name}</td>
                                                            <td className="px-6 py-4">
                                                                {b.budget_hours ? (
                                                                    <div className="min-w-[140px]">
                                                                        <div className="flex justify-between text-xs mb-1">
                                                                            <span className="text-slate-500">{b.hours_used}h / {b.budget_hours}h</span>
                                                                            <span className={`font-bold ${hPct >= 100 ? 'text-rose-600' : hPct >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{b.hours_used_pct}%</span>
                                                                        </div>
                                                                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                            <div className={`h-full rounded-full transition-all ${hPct >= 100 ? 'bg-rose-500' : hPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${hPct}%` }} />
                                                                        </div>
                                                                    </div>
                                                                ) : <span className="text-xs text-slate-400">Not set</span>}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                {b.budget_amount ? (
                                                                    <div className="min-w-[140px]">
                                                                        <div className="flex justify-between text-xs mb-1">
                                                                            <span className="text-slate-500">${b.amount_used.toFixed(0)} / ${b.budget_amount.toFixed(0)}</span>
                                                                            <span className={`font-bold ${aPct >= 100 ? 'text-rose-600' : aPct >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{b.amount_used_pct}%</span>
                                                                        </div>
                                                                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                            <div className={`h-full rounded-full transition-all ${aPct >= 100 ? 'bg-rose-500' : aPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${aPct}%` }} />
                                                                        </div>
                                                                    </div>
                                                                ) : <span className="text-xs text-slate-400">Not set</span>}
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>{statusLabel}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    title="Edit project budget"
                                                                    onClick={() => {
                                                                        const proj = projects.find(p => p.id === b.id);
                                                                        if (proj) openEditProject(proj);
                                                                    }}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ═══════════ ORIGINAL TABLE (legacy tabs) ═══════════ */}
                {!['payroll', 'bots', 'compliance', 'branding', 'budgets'].includes(activeTab) && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="font-bold text-slate-900 dark:text-white capitalize">
                            {activeTab === 'audit' ? 'System Audit Logs' : `${activeTab} Directory`}
                        </h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    {activeTab === 'projects' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Project</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Time Budget Burn</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Profitability (Cost)</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400"></th>
                                        </>
                                    )}
                                    {activeTab === 'users' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Email</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Team / Group</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-right">Rate ($/hr)</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                        </>
                                    )}
                                    {activeTab === 'teams' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Team</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Description</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-right">Action</th>
                                        </>
                                    )}
                                    {activeTab === 'integrations' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Integration App</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Configuration Summary</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                        </>
                                    )}
                                    {activeTab === 'audit' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Timestamp</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Source</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">User</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Action</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Details</th>
                                        </>
                                    )}
                                    {activeTab === 'notifications' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Timestamp</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">User</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Type</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Message</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Read</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-right">Action</th>
                                        </>
                                    )}
                                    {activeTab === 'corrections' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Submitted</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">User</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Requested Window</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Reason</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-right">Review</th>
                                        </>
                                    )}
                                    {activeTab === 'policy' && (
                                        <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Timer idle policy</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {activeTab === 'projects' && projects.map((p) => {
                                    const hoursBurned = p.hours_burned ?? 0;
                                    const costBurned = p.cost_burned ?? 0;
                                    const timePct = p.budget_hours ? (hoursBurned / p.budget_hours) * 100 : 0;
                                    const costPct = p.budget_amount ? (costBurned / p.budget_amount) * 100 : 0;
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                            <td className="px-6 py-4 text-sm font-semibold">
                                                <div className="flex items-center gap-3">
                                                    {p.logo_url ? (
                                                        <img src={resolveProjectLogoSrc(p.logo_url) ?? undefined} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{p.name.slice(0, 2).toUpperCase()}</div>
                                                    )}
                                                    <div>
                                                        <p className="text-slate-900 dark:text-slate-100">{p.name}</p>
                                                        <p className="text-xs text-slate-500 font-normal">{p.description || 'No description'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full">
                                                        <div className={`h-full rounded-full ${timePct > 90 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${Math.min(timePct, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{hoursBurned.toFixed(1)}h / {p.budget_hours || '∞'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full">
                                                        <div className={`h-full rounded-full ${costPct > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(costPct, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">${costBurned.toFixed(2)} / ${p.budget_amount || '∞'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right relative">
                                                <button type="button" className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setProjectMenuOpen(prev => prev === p.id ? null : p.id)}>
                                                    <span className="material-symbols-outlined text-sm">more_vert</span>
                                                </button>
                                                {projectMenuOpen === p.id && (
                                                    <div className="absolute right-6 top-12 z-20 min-w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => openEditProject(p)}>
                                                            <span className="material-symbols-outlined text-base">edit</span> Edit
                                                        </button>
                                                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => void handleDeleteProject(p)}>
                                                            <span className="material-symbols-outlined text-base">archive</span> Archive
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {activeTab === 'projects' && projects.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-10">
                                            <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center dark:border-slate-600 dark:bg-slate-900/40">
                                                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">No projects yet</h4>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    Create your first project to start assigning work, tracking budgets, and reporting team hours.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsProjectModalOpen(true)}
                                                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90"
                                                >
                                                    <Plus size={14} />
                                                    Create Project
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {activeTab === 'users' && users.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {u.first_name[0]}{u.last_name[0]}
                                                </div>
                                                <span className="text-sm font-semibold dark:text-slate-200">{u.first_name} {u.last_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">{u.email}</td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={u.team_name || 'unassigned'}
                                                onChange={(event) => void handleUpdateUserTeam(u, event.target.value)}
                                                disabled={teamSavingFor.has(u.id)}
                                                className="min-w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                                                aria-label={`Assign team for ${u.first_name} ${u.last_name}`}
                                            >
                                                <option value="unassigned">Unassigned</option>
                                                {teamOptions.map((team) => (
                                                    <option key={team} value={team}>{team}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {editingRateUserId === u.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-sm text-slate-400">$</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={editingRateValue}
                                                        onChange={e => setEditingRateValue(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') void handleSaveRate(u.id); if (e.key === 'Escape') setEditingRateUserId(null); }}
                                                        className="w-20 rounded border border-primary px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                        autoFocus
                                                    />
                                                    <button type="button" onClick={() => void handleSaveRate(u.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 px-1">✓</button>
                                                    <button type="button" onClick={() => setEditingRateUserId(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingRateUserId(u.id); setEditingRateValue(u.hourly_rate?.toString() ?? '0'); }}
                                                    className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-primary transition-colors group"
                                                    title="Click to edit billing rate"
                                                >
                                                    {u.hourly_rate != null && u.hourly_rate > 0 ? `$${Number(u.hourly_rate).toFixed(2)}` : <span className="text-slate-300 dark:text-slate-600 group-hover:text-primary">Set rate</span>}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${u.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span> {u.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {activeTab === 'teams' && (teams.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">No teams created yet.</td></tr>
                                ) : teams.map((team) => (
                                    <tr key={team.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100">{team.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500">{team.description || 'No description'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${team.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${team.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                                {team.is_active ? 'Active' : 'Archived'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                className={`text-xs font-bold ${team.is_active ? 'text-rose-600' : 'text-emerald-600'}`}
                                                onClick={() => void handleToggleTeam(team)}
                                            >
                                                {team.is_active ? 'Archive' : 'Restore'}
                                            </button>
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'integrations' && (integrations.length === 0 ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-sm">No integrations configured.</td></tr>
                                ) : integrations.map((intg, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 font-semibold text-sm capitalize dark:text-slate-200">{intg.type}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {JSON.stringify(intg.summary || {})}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${intg.is_active ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${intg.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span> {intg.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'audit' && (auditLogs.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">No audit logs found.</td></tr>
                                ) : auditLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                                                log.source === 'auth'
                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                            }`}>
                                                {log.source === 'auth' ? 'Auth Event' : 'Audit Log'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-semibold dark:text-slate-200">{getAuditUserPrimary(log)}</p>
                                            {getAuditUserSecondary(log) && (
                                                <p className="text-xs text-slate-500">{getAuditUserSecondary(log)}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                    {getAuditActionLabel(log)}
                                                </span>
                                                {log.source === 'auth' && log.outcome && (
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                                        log.outcome === 'success'
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                                    }`}>
                                                        {log.outcome}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-slate-700 dark:text-slate-300">{getAuditDetails(log).headline}</p>
                                            {getAuditDetails(log).supporting && (
                                                <p className="text-xs text-slate-500">{getAuditDetails(log).supporting}</p>
                                            )}
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'notifications' && (notifications.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-sm">No system notifications found.</td></tr>
                                ) : notifications.map((notif) => (
                                    <tr key={notif.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm text-slate-500">{new Date(notif.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-sm font-semibold dark:text-slate-200">{notif.user.email}</td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{notif.type}</td>
                                        <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{notif.message}</td>
                                        <td className="px-6 py-4 text-center">
                                            {notif.is_read ? (
                                                <span className="material-symbols-outlined text-emerald-500 text-sm">done_all</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-slate-300 text-sm">check</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                className="text-xs font-bold text-rose-500 hover:text-rose-600"
                                                onClick={() => void handleDeleteNotification(notif.id)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'corrections' && (corrections.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-sm">No correction requests found.</td></tr>
                                ) : corrections.map((correction) => (
                                    <tr key={correction.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm text-slate-500">{new Date(correction.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-sm font-semibold dark:text-slate-200">
                                            {correction.user?.email || correction.user_id}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(correction.requested_start_time).toLocaleString()} – {new Date(correction.requested_end_time).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{correction.reason}</td>
                                        <td className="px-6 py-4 text-xs font-bold uppercase text-slate-500">{correction.status}</td>
                                        <td className="px-6 py-4 text-right">
                                            {correction.status === 'PENDING' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" className="text-xs font-bold text-emerald-600" onClick={() => void handleReviewCorrection(correction.id, 'approve')}>Approve</button>
                                                    <button type="button" className="text-xs font-bold text-rose-600" onClick={() => void handleReviewCorrection(correction.id, 'reject')}>Reject</button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">Reviewed</span>
                                            )}
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'policy' && (
                                    <tr>
                                        <td className="px-6 py-6">
                                            {timerPolicy ? (
                                                <form className="grid gap-4 md:grid-cols-3" onSubmit={(event) => void handleSaveTimerPolicy(event)}>
                                                    {[
                                                        ['heartbeatIntervalSeconds', 'Heartbeat seconds'],
                                                        ['missedHeartbeatWarningThreshold', 'Missed heartbeat warning'],
                                                        ['missedHeartbeatPauseThreshold', 'Missed heartbeat pause'],
                                                        ['idleWarningAfterMinutes', 'Idle warning minutes'],
                                                        ['idlePauseAfterMinutes', 'Idle pause minutes'],
                                                        ['maxSessionDurationHours', 'Max session hours'],
                                                        ['requireNoteOnResumeAfterMinutes', 'Resume note minutes'],
                                                    ].map(([key, label]) => (
                                                        <label key={key} className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                                            {label}
                                                            <input
                                                                type="number"
                                                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                                value={timerPolicy[key as keyof TimerPolicySummary] as number}
                                                                onChange={(event) => setTimerPolicy((current) => current ? {
                                                                    ...current,
                                                                    [key]: Number(event.target.value),
                                                                } : current)}
                                                            />
                                                        </label>
                                                    ))}
                                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={timerPolicy.allowResumeAfterIdlePause}
                                                            onChange={(event) => setTimerPolicy((current) => current ? {
                                                                ...current,
                                                                allowResumeAfterIdlePause: event.target.checked,
                                                            } : current)}
                                                        />
                                                        Allow resume after idle pause
                                                    </label>
                                                    <div className="flex items-center gap-3 md:col-span-3">
                                                        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Save policy</button>
                                                        {policyFeedback && <span className="text-sm text-slate-500">{policyFeedback}</span>}
                                                    </div>
                                                </form>
                                            ) : (
                                                <p className="text-sm text-slate-500">Timer policy unavailable.</p>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                )} {/* end legacy-tabs table */}

                {/* New Project Modal Overlay */}
                {isProjectModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <span className="font-bold text-lg dark:text-white">{editingProject ? 'Edit Project' : 'Create New Project'}</span>
                                <button type="button" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={resetProjectForm}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6">
                                <form onSubmit={handleCreateProject}>
                                    <div className="mb-4">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Project Logo</label>
                                        <div className="flex items-center gap-4">
                                            {projectLogoPreview ? (
                                                <img src={projectLogoPreview} alt="Logo" className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-bold">LOGO</div>
                                            )}
                                            <div>
                                                <label className="inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                    Upload Image
                                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                                </label>
                                                {projectLogoPreview && (
                                                    <button type="button" className="ml-2 text-xs text-rose-500 hover:underline" onClick={() => { setProjectLogoPreview(null); setProjectLogoData(null); }}>Remove</button>
                                                )}
                                                <p className="text-xs text-slate-400 mt-1">Max 2MB. PNG, JPG, or SVG.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Project Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                            placeholder="e.g. Website Redesign"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                                        <textarea
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                            placeholder="Brief details about this project..."
                                            rows={2}
                                            value={newProjectDesc}
                                            onChange={(e) => setNewProjectDesc(e.target.value)}
                                        ></textarea>
                                    </div>
                                    <div className="flex gap-4 mb-6">
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Budgeted Hours</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                                placeholder="e.g. 100"
                                                value={newProjectBudgetHours}
                                                onChange={(e) => setNewProjectBudgetHours(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Budgeted Cost ($)</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                                placeholder="e.g. 5000"
                                                value={newProjectBudgetAmount}
                                                onChange={(e) => setNewProjectBudgetAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button type="button" className="px-4 py-2 font-bold text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" onClick={resetProjectForm}>Cancel</button>
                                        <button type="submit" className="px-6 py-2 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 shadow-md">{editingProject ? 'Save Changes' : 'Create Project'}</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;
