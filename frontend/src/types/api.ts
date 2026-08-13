export interface RoleSummary {
    name: string;
}

export interface ApprovalIntelligence {
    score: number;
    level: 'low' | 'medium' | 'high';
    reasons: string[];
}

export interface RoleOption {
    id: string;
    name: string;
}

export interface UserSummary {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    team_name?: string | null;
    is_active: boolean;
    hourly_rate?: number | null;
    role?: RoleSummary;
    employment_type?: string | null;
    min_weekly_hours?: number | null;
    mfa_enabled?: boolean;
}

export type EmploymentType = 'employee' | 'intern' | 'contractor';

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'intern', label: 'Intern' },
    { value: 'contractor', label: 'Contractor' },
];

export interface ProjectSummary {
    id: string;
    name: string;
    description?: string | null;
    logo_url?: string | null;
    budget_hours?: number | null;
    budget_amount?: number | null;
    hours_burned?: number;
    cost_burned?: number;
    is_active?: boolean;
}

export interface TeamSummary {
    id: string;
    name: string;
    description?: string | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface UserImportResultSummary {
    total: number;
    created: number;
    skipped: number;
    failed: number;
}

export interface CreatedImportedUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    team_name?: string | null;
    role: string;
    assigned_projects: number;
}

export interface SkippedImportedUser {
    email: string;
    reason: string;
}

export interface FailedImportedUser {
    email: string;
    reason: string;
}

export interface BulkUserImportResponse {
    summary: UserImportResultSummary;
    created: CreatedImportedUser[];
    skipped: SkippedImportedUser[];
    failed: FailedImportedUser[];
}

export interface ProjectReference {
    id?: string;
    name: string;
}

export interface TimeEntrySummary {
    id: string;
    task_description: string;
    duration: number;
    start_time: string;
    end_time: string;
    status: string;
    entry_type?: string;
    notes?: string | null;
    is_billable?: boolean;
    auto_stopped?: boolean;
    stop_reason?: string | null;
    over_daily_cap?: boolean;
    overtime_reason?: string | null;
    auto_stop_reviewed_at?: string | null;
    intelligence?: ApprovalIntelligence;
    user: UserSummary;
    project?: ProjectReference | null;
}

export interface DailyEntry {
    id: string;
    task_description: string;
    duration: number;
    start_time: string;
    end_time: string;
    status: string;
    is_billable?: boolean;
    project?: ProjectReference | null;
}

export interface DailyBreakdownResponse {
    date: string;
    user: { id: string; first_name: string; last_name: string; email: string } | null;
    entries: DailyEntry[];
    totalSeconds: number;
}

export interface ActiveTimerSummary {
    id: string;
    project_id?: string | null;
    task_description: string;
    start_time: string;
    last_active_ping?: string | null;
    is_paused?: boolean;
    pause_reason?: string | null;
    paused_at?: string | null;
    paused_duration_seconds?: number;
    project?: ProjectReference | null;
}

export interface TimerEntriesResponse {
    entries: TimeEntrySummary[];
    activeTimer?: ActiveTimerSummary | null;
}

/** Response of GET /timers/active — the lean endpoint used by the heartbeat poller. */
export interface ActiveTimerResponse {
    activeTimer?: ActiveTimerSummary | null;
}

export interface TimerCorrectionRequestSummary {
    id: string;
    user_id: string;
    timer_session_id?: string | null;
    requested_start_time: string;
    requested_end_time: string;
    requested_duration_seconds: number;
    reason: string;
    work_note?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    reviewer_note?: string | null;
    created_at: string;
    updated_at: string;
    user?: UserSummary;
}

export interface TimerPolicySummary {
    heartbeatIntervalSeconds: number;
    missedHeartbeatWarningThreshold: number;
    missedHeartbeatPauseThreshold: number;
    idleWarningAfterMinutes: number;
    idlePauseAfterMinutes: number;
    maxSessionDurationHours: number;
    allowResumeAfterIdlePause: boolean;
    requireNoteOnResumeAfterMinutes: number;
    dailyCapHours: number;
    internDailyFloorHours: number;
    weeklyRecoveryLimit: number;
    abandonedTimerGraceMinutes: number;
}

/** Where the user stands against their daily limits. Served by POST /timers/ping. */
export type DailyCapState = 'ok' | 'floor_passed' | 'approaching' | 'at_cap' | 'over_cap';

export interface DailyCapSummary {
    workedSeconds: number;
    capSeconds: number;
    /** 0 for anyone without a daily floor (everyone who is not an intern). */
    floorSeconds: number;
    remainingSeconds: number;
    state: DailyCapState;
    localDate: string;
}

/** 409 body returned by every write path when the daily cap would be exceeded. */
export interface DailyCapConflict {
    code: 'DAILY_CAP_REACHED';
    message: string;
    worked_seconds: number;
    cap_seconds: number;
    floor_seconds: number;
    local_date: string;
    timezone: string;
}

export interface TimeClashConflict {
    id: string;
    kind: 'entry' | 'correction';
    start: string;
    end: string;
    label: string;
    status: string;
}

/** 409 body returned when a write clashes with time already on the timeline. */
export interface TimeOverlapConflict {
    code: 'TIME_OVERLAP';
    message: string;
    conflicts: TimeClashConflict[];
}

export type RecoveryTier = 'normal' | 'final' | 'blocked';

export interface RecoveryUsageSummary {
    used: number;
    limit: number;
    base_limit: number;
    granted_extra: number;
    remaining: number;
    week_start: string;
    week_end: string;
    timezone: string;
    tier: RecoveryTier;
    requires_acknowledgement: boolean;
    min_reason_length: number;
}

export interface BulkReviewResult {
    updated: number;
    skipped_locked: string[];
    skipped_not_pending: string[];
    not_found: string[];
    message: string;
}

export interface CalendarEventSuggestion {
    id: string;
    title: string;
    start: string;
    end: string;
    suggested_project?: string;
}

export interface CalendarStatus {
    configured: boolean;
    connected: boolean;
    provider: string;
    email?: string | null;
}

export interface IntegrationSummary {
    type: string;
    is_active: boolean;
    summary?: Record<string, string>;
}

export interface TaskSourceSummary {
    type: string;
    label: string;
    readiness: 'live' | 'configured' | 'error';
}

export interface AnalyticsMetrics {
    totalHours: string;
    activeProjects: number;
    avgProductivity: number;
    billableAmount: string;
    trends: {
        hours: string;
        projects: string;
        productivity: string;
        billable: string;
    };
}

export interface AnalyticsTrend {
    name: string;
    hours: number;
}

export interface AnalyticsProjectDistribution {
    id: string;
    name: string;
    hours: number;
    percentage: number;
}

export interface AnalyticsUserBreakdown {
    id: string;
    name: string;
    teamName?: string;
    role: string;
    initials: string;
    primaryProject: string;
    totalHours: string;
    approved_hours?: number;
    pending_hours?: number;
    rejected_hours?: number;
    efficiency: number;
    status: string;
}

export interface AnalyticsHoursByStatus {
    approved_hours: number;
    pending_hours: number;
    rejected_hours: number;
}

export interface AnalyticsMonthlySummary {
    month_label: string;
    total_hours: number;
    approved_hours: number;
}

export interface AnalyticsPtoStatusSummary {
    count: number;
    days: number;
}

export interface AnalyticsPtoSummary {
    pending: AnalyticsPtoStatusSummary;
    approved: AnalyticsPtoStatusSummary;
    rejected: AnalyticsPtoStatusSummary;
}

export interface AnalyticsCorrectionsSummary {
    pending: number;
    approved: number;
    rejected: number;
}

export interface AnalyticsDashboardResponse {
    metrics: AnalyticsMetrics;
    hoursTrend: AnalyticsTrend[];
    projectDistribution: AnalyticsProjectDistribution[];
    userBreakdown: AnalyticsUserBreakdown[];
    hoursByStatus?: AnalyticsHoursByStatus;
    monthly?: AnalyticsMonthlySummary;
    pto?: AnalyticsPtoSummary;
    corrections?: AnalyticsCorrectionsSummary;
}

export interface AuditLogSummary {
    id: string;
    source: 'audit' | 'auth';
    action: string;
    resource: string;
    created_at: string;
    user: {
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
    } | null;
    email?: string | null;
    outcome?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
}

export interface AuthEventSummary {
    id: string;
    user_id?: string | null;
    email?: string | null;
    event_type: string;
    outcome: string;
    reason?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    metadata?: Record<string, unknown>;
    created_at: string;
}

export interface NotificationSummary {
    id: string;
    message: string;
    type: string;
    is_read: boolean;
    read_at?: string | null;
    deleted_at?: string | null;
    created_at: string;
    user: { email: string; first_name: string; last_name: string };
}

export interface NotificationsListResponse {
    notifications: NotificationSummary[];
    unread_count?: number;
    total_count?: number;
}

export interface WorkloadAlertSummary {
    id: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: string;
}

export interface UserWellbeingSummary {
    sevenDayHours: number;
    averageDailyHours: number;
    burnoutThresholdHours: number;
    cautionThresholdHours: number;
    hoursUntilBurnout: number;
    weeklyHourLimit: number | null;
    status: 'balanced' | 'approaching_burnout' | 'burnout_risk';
    workloadAlerts: WorkloadAlertSummary[];
}

export interface ManagerOperationsResponse {
    managerExceptions: {
        pendingApprovals: TimeEntrySummary[];
        idleWarnings: NotificationSummary[];
        overtimeAlerts: NotificationSummary[];
        burnoutAlerts: NotificationSummary[];
        rejectedEntries: Array<{
            id: string;
            task_description: string;
            updated_at: string;
            user: { first_name: string; last_name: string };
            project?: { name: string } | null;
        }>;
        budgetAlerts: Array<{
            project_id: string;
            project_name: string;
            budgetHours: number;
            projectedHours: number;
            trackedHours: number;
        }>;
    };
    teamForecast: {
        members: Array<{
            user_id: string;
            name: string;
            role: string;
            sevenDayHours: number;
            projectedFourteenDayHours: number;
            remainingCapacityHours: number;
            projectedStatus: UserWellbeingSummary['status'];
            overloadRisk: boolean;
        }>;
        projects: Array<{
            project_id: string;
            name: string;
            budgetHours: number | null;
            trackedHours: number;
            approvedBillableHours: number;
            projectedFourteenDayHours: number;
            planningAccuracy: number | null;
            burnRisk: boolean;
        }>;
    };
    teamBenchmarks: {
        planningAccuracyPct: number;
        approvalLatencyHours: number;
        billableLeakageHours: number;
        overloadRiskCount: number;
        byPerson: Array<{
            user_id: string;
            name: string;
            role: string;
            projectedFourteenDayHours: number;
            remainingCapacityHours: number;
            overloadRisk: boolean;
        }>;
    };
    meta?: {
        degraded: boolean;
        warnings: string[];
    };
}

export interface SharedArtifactResponse {
    type: 'operations' | 'project-burn' | 'invoice-evidence';
    title: string;
    description: string;
    generatedAt: string;
    data: unknown;
}

export interface InvoiceLineItem {
    id: string;
    description: string;
    hours: number;
    rate: number;
    amount: number;
}

export interface InvoiceSummary {
    id: string;
    invoice_number: string;
    client_name: string;
    status: string;
    subtotal: number;
    tax_rate: number;
    total: number;
    notes?: string | null;
    due_date?: string | null;
    issued_at?: string | null;
    paid_at?: string | null;
    created_at: string;
    project?: ProjectReference | null;
    creator?: { first_name: string; last_name: string };
    line_items: InvoiceLineItem[];
}

export interface ScheduleEntrySummary {
    id: string;
    title: string;
    entry_type: 'shift' | 'availability' | 'unavailable';
    start_time: string;
    end_time: string;
    notes?: string | null;
    color?: string | null;
    user_id: string;
    project_id?: string | null;
    assignee: Pick<UserSummary, 'id' | 'first_name' | 'last_name' | 'email' | 'team_name'>;
    project?: ProjectReference | null;
}

export interface ExpenseAttachmentSummary {
    id: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
    created_at: string;
}

export interface ExpenseSummary {
    id: string;
    user_id: string;
    project_id?: string | null;
    description: string;
    category: string;
    amount: number;
    currency: string;
    incurred_on: string;
    is_billable: boolean;
    status: 'pending' | 'approved' | 'rejected';
    reviewer_note?: string | null;
    created_at: string;
    owner: Pick<UserSummary, 'id' | 'first_name' | 'last_name' | 'email'>;
    project?: ProjectReference | null;
    attachments: ExpenseAttachmentSummary[];
    invoice_line_item?: { id: string; invoice_id: string } | null;
}

export interface GeofencePolicySummary {
    enabled: boolean;
    enforce_on_clock_in: boolean;
    max_accuracy_meters: number;
}

export interface GeofenceZoneSummary {
    id: string;
    name: string;
    rule_type: 'allow' | 'deny';
    latitude: number;
    longitude: number;
    radius_meters: number;
    is_active: boolean;
}

export interface ProjectTemplateSummary {
    id: string;
    name: string;
    description?: string | null;
    default_billable: boolean;
    budget_hours?: number | null;
    budget_amount?: number | null;
    tag_ids: string[];
    created_at: string;
    creator?: { first_name: string; last_name: string };
}

export interface WebhookSummary {
    id: string;
    url: string;
    events: string[];
    is_active: boolean;
    created_at: string;
}
