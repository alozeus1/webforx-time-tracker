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
    is_active: boolean;
    role?: RoleSummary;
}

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
    intelligence?: ApprovalIntelligence;
    user: UserSummary;
    project?: ProjectReference | null;
}

export interface ActiveTimerSummary {
    id: string;
    project_id?: string | null;
    task_description: string;
    start_time: string;
    last_active_ping?: string | null;
    is_paused?: boolean;
    paused_at?: string | null;
    paused_duration_seconds?: number;
    project?: ProjectReference | null;
}

export interface TimerEntriesResponse {
    entries: TimeEntrySummary[];
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
    role: string;
    initials: string;
    primaryProject: string;
    totalHours: string;
    efficiency: number;
    status: string;
}

export interface AnalyticsDashboardResponse {
    metrics: AnalyticsMetrics;
    hoursTrend: AnalyticsTrend[];
    projectDistribution: AnalyticsProjectDistribution[];
    userBreakdown: AnalyticsUserBreakdown[];
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
