export interface RoleSummary {
    name: string;
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
    user: UserSummary;
    project?: ProjectReference | null;
}

export interface ActiveTimerSummary {
    id: string;
    project_id?: string | null;
    task_description: string;
    start_time: string;
    last_active_ping?: string | null;
    project?: ProjectReference | null;
}

export interface TimerEntriesResponse {
    entries: TimeEntrySummary[];
    activeTimer?: ActiveTimerSummary | null;
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
    action: string;
    resource: string;
    created_at: string;
    user: { email: string; first_name: string; last_name: string };
}

export interface NotificationSummary {
    id: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: string;
    user: { email: string; first_name: string; last_name: string };
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
