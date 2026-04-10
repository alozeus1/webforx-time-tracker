import { expect, type Page } from '@playwright/test';

export type AppRole = 'Employee' | 'Manager' | 'Admin';

type MockOptions = {
  role?: AppRole;
  loginMode?: 'success' | 'failure';
  activeTimer?: boolean;
};

const roleToToken: Record<AppRole, string> = {
  Employee: 'mock-jwt-employee',
  Manager: 'mock-jwt-manager',
  Admin: 'mock-jwt-admin',
};

const roleToUser = (role: AppRole) => ({
  id: role === 'Admin' ? 'admin-1' : role === 'Manager' ? 'manager-1' : 'employee-1',
  first_name: role === 'Admin' ? 'Admin' : role === 'Manager' ? 'Manager' : 'Employee',
  last_name: 'User',
  name: `${role} User`,
  email: role === 'Admin' ? 'admin@webforxtech.com' : role === 'Manager' ? 'manager@webforxtech.com' : 'employee@webforxtech.com',
  role,
});

const toTeamUser = (role: AppRole, overrides: Partial<ReturnType<typeof roleToUser>> = {}) => {
  const user = { ...roleToUser(role), ...overrides };
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    is_active: true,
    role: { name: role },
  };
};

const inferRoleFromEmail = (email?: string): AppRole => {
  if (!email) return 'Employee';
  const lowered = email.toLowerCase();
  if (lowered.includes('admin')) return 'Admin';
  if (lowered.includes('manager')) return 'Manager';
  return 'Employee';
};

const mockProjects = [
  { id: 'proj-1', name: 'Platform Engineering', description: 'Core platform', is_active: true, hours_burned: 24, cost_burned: 1200 },
  { id: 'proj-2', name: 'Webforx Website', description: 'Marketing site', is_active: true, hours_burned: 11, cost_burned: 550 },
];

export const installStableApiMocks = async (page: Page, options: MockOptions = {}) => {
  const configuredRole = options.role ?? 'Employee';
  const loginMode = options.loginMode ?? 'success';
  let timerRunning = Boolean(options.activeTimer);
  let timerTaskDescription = 'Test task';
  let invoiceList = [
    {
      id: 'invoice-1',
      invoice_number: 'INV-20260328-1001',
      client_name: 'Acme Advisory',
      status: 'draft',
      subtotal: 1800,
      tax_rate: 0,
      total: 1800,
      notes: 'Monthly services',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      created_at: new Date().toISOString(),
      project: { id: mockProjects[0].id, name: mockProjects[0].name },
      line_items: [
        { id: 'line-1', description: 'Implementation sprint', hours: 12, rate: 150, amount: 1800 },
      ],
    },
  ];
  let teamUsers = configuredRole === 'Admin'
    ? [
      toTeamUser('Admin'),
      toTeamUser('Manager'),
      toTeamUser('Employee'),
    ]
    : configuredRole === 'Manager'
      ? [
        toTeamUser('Manager'),
        toTeamUser('Employee', {
          id: 'employee-2',
          first_name: 'Jordan',
          last_name: 'Cole',
          email: 'jordan.cole@webforxtech.com',
        }),
      ]
      : [
        toTeamUser('Employee'),
      ];

  await page.unroute('**/api/v1/**').catch(() => undefined);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    const respond = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (path.endsWith('/auth/login') && method === 'POST') {
      if (loginMode === 'failure') {
        return respond(401, { message: 'Invalid credentials' });
      }

      let role = configuredRole;
      if (!options.role) {
        try {
          const payload = JSON.parse(request.postData() || '{}') as { email?: string };
          role = inferRoleFromEmail(payload.email);
        } catch {
          role = configuredRole;
        }
      }

      const user = roleToUser(role);
      return respond(200, {
        token: roleToToken[role],
        refreshToken: `refresh-${role.toLowerCase()}`,
        user,
      });
    }

    if (path.endsWith('/auth/refresh') && method === 'POST') {
      const user = roleToUser(configuredRole);
      return respond(200, {
        token: roleToToken[configuredRole],
        refreshToken: `refresh-${configuredRole.toLowerCase()}`,
        user,
      });
    }

    if (path.endsWith('/users/me')) {
      return respond(200, roleToUser(configuredRole));
    }

    if (path.endsWith('/users') && method === 'GET') {
      return respond(200, teamUsers);
    }

    if (path.endsWith('/users/roles') && method === 'GET') {
      return respond(200, {
        roles: [
          { id: 'role-admin', name: 'Admin' },
          { id: 'role-manager', name: 'Manager' },
          { id: 'role-employee', name: 'Employee' },
          { id: 'role-intern', name: 'Intern' },
        ],
      });
    }

    if (path.endsWith('/users/import') && method === 'POST') {
      return respond(200, {
        summary: { total: 0, created: 0, skipped: 0, failed: 0 },
        created: [],
        skipped: [],
        failed: [],
      });
    }

    if (path.endsWith('/users') && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as {
        first_name?: string;
        last_name?: string;
        email?: string;
        role?: AppRole;
      };
      const createdUser = {
        id: `user-${teamUsers.length + 1}`,
        first_name: payload.first_name || 'New',
        last_name: payload.last_name || 'User',
        email: payload.email || `user-${teamUsers.length + 1}@webforxtech.com`,
        is_active: true,
        role: { name: payload.role || 'Employee' },
      };
      teamUsers = [createdUser, ...teamUsers];
      return respond(201, createdUser);
    }

    if (/\/users\/[^/]+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
      const userId = path.split('/').pop() as string;

      if (method === 'PUT') {
        const payload = JSON.parse(request.postData() || '{}') as {
          first_name?: string;
          last_name?: string;
          email?: string;
          role?: AppRole;
          is_active?: boolean;
        };
        teamUsers = teamUsers.map((user) =>
          user.id === userId
            ? {
              ...user,
              first_name: payload.first_name ?? user.first_name,
              last_name: payload.last_name ?? user.last_name,
              email: payload.email ?? user.email,
              is_active: payload.is_active ?? user.is_active,
              role: payload.role ? { name: payload.role } : user.role,
            }
            : user,
        );
      }

      if (method === 'DELETE') {
        teamUsers = teamUsers.map((user) =>
          user.id === userId
            ? {
              ...user,
              is_active: false,
            }
            : user,
        );
      }

      return respond(200, { success: true });
    }

    if (path.endsWith('/users/me/notifications')) {
      return respond(200, { notifications: [] });
    }

    if (path.endsWith('/users/me/wellbeing')) {
      return respond(200, {
        sevenDayHours: configuredRole === 'Manager' ? 47.5 : 36.0,
        averageDailyHours: configuredRole === 'Manager' ? 6.79 : 5.14,
        burnoutThresholdHours: 50,
        cautionThresholdHours: 45,
        hoursUntilBurnout: configuredRole === 'Manager' ? 2.5 : 14,
        weeklyHourLimit: 40,
        status: configuredRole === 'Manager' ? 'approaching_burnout' : 'balanced',
        workloadAlerts: configuredRole === 'Manager'
          ? [
            {
              id: 'alert-manager-1',
              type: 'overtime_alert',
              message: 'You have logged 42.0h this week, exceeding your 40h weekly limit.',
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ]
          : [],
      });
    }

    if (path.endsWith('/calendar/status')) {
      return respond(200, { connected: true, email: 'manager@webforxtech.com' });
    }

    if (path.endsWith('/calendar/events')) {
      return respond(200, {
        events: [
          {
            id: 'event-1',
            title: 'Client planning sync',
            start: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
            end: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
            suggested_project: mockProjects[0].name,
          },
          {
            id: 'event-2',
            title: 'Design review',
            start: new Date(new Date().setHours(13, 0, 0, 0)).toISOString(),
            end: new Date(new Date().setHours(13, 45, 0, 0)).toISOString(),
            suggested_project: mockProjects[1].name,
          },
        ],
      });
    }

    if (path.endsWith('/admin/notifications')) {
      return respond(200, { notifications: [] });
    }

    if (path.endsWith('/projects') && method === 'GET') {
      return respond(200, mockProjects);
    }

    if (path.endsWith('/integrations') && method === 'GET') {
      return respond(200, {
        googleCalendar: { connected: true, email: 'manager@webforxtech.com' },
        github: { connected: true, repo: 'webforx/time-tracker', branch: 'main' },
        jira: null,
        linear: null,
        asana: null,
        clickup: null,
        trello: null,
      });
    }

    if (path.endsWith('/integrations/task-sources') && method === 'GET') {
      return respond(200, {
        sources: [
          { type: 'github', label: 'webforx/time-tracker · main', readiness: 'connected' },
          { type: 'linear', label: 'Product engineering workspace', readiness: 'configured' },
        ],
      });
    }

    if (path.endsWith('/integrations/github/commits') && method === 'GET') {
      return respond(200, {
        commits: [
          {
            id: 'commit-1',
            message: 'Ship workload insights and review queue',
            repo: 'webforx/time-tracker',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'commit-2',
            message: 'Polish team management workflow',
            repo: 'webforx/time-tracker',
            timestamp: new Date(Date.now() - 60 * 60_000).toISOString(),
          },
        ],
      });
    }

    if (path.endsWith('/projects/budgets')) {
      return respond(200, { budgets: [] });
    }

    if (path.endsWith('/timers/me')) {
      const activeTimer = timerRunning
        ? {
          id: 'timer-active',
          user_id: roleToUser(configuredRole).id,
          project_id: mockProjects[0].id,
          task_description: timerTaskDescription,
          start_time: new Date(Date.now() - 15 * 60_000).toISOString(),
        }
        : null;

      return respond(200, {
        entries: [
          {
            id: 'entry-1',
            user_id: roleToUser(configuredRole).id,
            project_id: mockProjects[0].id,
            task_description: 'Architecture review',
            start_time: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
            end_time: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
            duration: 5400,
            entry_type: 'timer',
            status: 'approved',
            is_billable: true,
            project: { id: mockProjects[0].id, name: mockProjects[0].name },
            user: roleToUser(configuredRole),
          },
          {
            id: 'entry-2',
            user_id: roleToUser(configuredRole).id,
            project_id: mockProjects[1].id,
            task_description: 'Prototype build',
            start_time: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
            end_time: new Date(new Date().setHours(15, 15, 0, 0)).toISOString(),
            duration: 4500,
            entry_type: 'manual',
            status: 'pending',
            is_billable: true,
            notes: 'Recovered from browser activity',
            project: { id: mockProjects[1].id, name: mockProjects[1].name },
            user: roleToUser(configuredRole),
          },
        ],
        activeTimer,
      });
    }

    if (path.endsWith('/timers/start') && method === 'POST') {
      try {
        const payload = JSON.parse(request.postData() || '{}') as { task_description?: string };
        timerTaskDescription = payload.task_description || timerTaskDescription;
      } catch {
        // No-op, keep fallback task description.
      }
      timerRunning = true;
      return respond(201, {
        id: 'timer-new',
        user_id: roleToUser(configuredRole).id,
        project_id: mockProjects[0].id,
        task_description: timerTaskDescription,
        start_time: new Date().toISOString(),
      });
    }

    if (path.endsWith('/timers/stop') && method === 'POST') {
      timerRunning = false;
      return respond(200, {
        id: 'entry-stopped',
        user_id: roleToUser(configuredRole).id,
        project_id: mockProjects[0].id,
        task_description: timerTaskDescription,
        start_time: new Date(Date.now() - 30 * 60_000).toISOString(),
        end_time: new Date().toISOString(),
        duration: 1800,
        entry_type: 'timer',
        status: 'pending',
      });
    }

    if (path.endsWith('/timers/manual') && method === 'POST') {
      return respond(201, {
        id: 'entry-manual',
        project_id: mockProjects[0].id,
        task_description: 'Manual entry',
        duration: 3600,
      });
    }

    if (path.endsWith('/timers/ping')) {
      return respond(200, { message: 'Ping successful' });
    }

    if (path.includes('/reports/dashboard') || path.includes('/reports/analytics')) {
      return respond(200, {
        metrics: {
          totalHours: '12.5',
          activeProjects: 2,
          avgProductivity: 84,
          billableAmount: '1200',
          trends: {
            hours: '+8%',
            projects: '+1',
            productivity: '+3%',
            billable: '+6%',
          },
        },
        hoursTrend: [
          { name: 'Mon', hours: 7 },
          { name: 'Tue', hours: 5.5 },
        ],
        projectDistribution: [
          { id: mockProjects[0].id, name: mockProjects[0].name, hours: 7, percentage: 56 },
          { id: mockProjects[1].id, name: mockProjects[1].name, hours: 5.5, percentage: 44 },
        ],
        userBreakdown: [
          {
            id: roleToUser(configuredRole).id,
            name: roleToUser(configuredRole).name,
            role: configuredRole,
            initials: configuredRole === 'Admin' ? 'AU' : configuredRole === 'Manager' ? 'MU' : 'EU',
            primaryProject: mockProjects[0].name,
            totalHours: '12.5',
            efficiency: 84,
            status: 'active',
          },
        ],
      });
    }

    if (path.endsWith('/reports/operations') && method === 'GET') {
      return respond(200, {
        managerExceptions: {
          pendingApprovals: [
            {
              id: 'pending-1',
              task_description: 'Late-night production fix',
              start_time: new Date(new Date().setHours(23, 0, 0, 0)).toISOString(),
              end_time: new Date(new Date().setHours(23, 50, 0, 0)).toISOString(),
              duration: 3000,
              entry_type: 'manual',
              created_at: new Date().toISOString(),
              user: {
                id: 'employee-7',
                first_name: 'Nadia',
                last_name: 'Stone',
                email: 'nadia.stone@webforxtech.com',
              },
              project: {
                id: mockProjects[0].id,
                name: mockProjects[0].name,
              },
              intelligence: {
                score: 66,
                level: 'high',
                reasons: ['manual entry', 'outside standard hours'],
              },
            },
          ],
          idleWarnings: [],
          overtimeAlerts: [],
          burnoutAlerts: [],
          rejectedEntries: [],
          budgetAlerts: [
            {
              project_id: mockProjects[0].id,
              project_name: mockProjects[0].name,
              budgetHours: 40,
              projectedHours: 48,
              trackedHours: 31,
            },
          ],
        },
        teamForecast: {
          members: [
            {
              user_id: 'manager-1',
              name: 'Manager User',
              role: 'Manager',
              sevenDayHours: 47.5,
              projectedFourteenDayHours: 95,
              remainingCapacityHours: -15,
              projectedStatus: 'approaching_burnout',
              overloadRisk: true,
            },
          ],
          projects: [
            {
              project_id: mockProjects[0].id,
              name: mockProjects[0].name,
              budgetHours: 40,
              trackedHours: 31,
              approvedBillableHours: 28,
              projectedFourteenDayHours: 48,
              planningAccuracy: 78,
              burnRisk: true,
            },
          ],
        },
        teamBenchmarks: {
          planningAccuracyPct: 78,
          approvalLatencyHours: 5.4,
          billableLeakageHours: 3.2,
          overloadRiskCount: 1,
          byPerson: [
            {
              user_id: 'manager-1',
              name: 'Manager User',
              role: 'Manager',
              projectedFourteenDayHours: 95,
              remainingCapacityHours: -15,
              overloadRisk: true,
            },
          ],
        },
      });
    }

    if (path.endsWith('/reports/share') && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as { type?: string; id?: string };
      return respond(201, {
        token: 'mock-share-token',
        url: `http://127.0.0.1:4173/share/mock-share-token?type=${payload.type || 'operations'}${payload.id ? `&id=${payload.id}` : ''}`,
        preview: {
          type: payload.type || 'operations',
          title: 'Mock shared artifact',
          description: 'Shared evidence preview',
          generatedAt: new Date().toISOString(),
          data: { id: payload.id || null },
        },
      });
    }

    if (path.endsWith('/public/share/mock-share-token') && method === 'GET') {
      return respond(200, {
        type: 'invoice-evidence',
        title: 'INV-20260328-1001 invoice evidence',
        description: 'Approved line-item evidence for this invoice.',
        generatedAt: new Date().toISOString(),
        data: invoiceList[0],
      });
    }

    if (path.endsWith('/invoices') && method === 'GET') {
      return respond(200, { invoices: invoiceList });
    }

    if (path.endsWith('/invoices') && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as {
        client_name?: string;
        project_id?: string;
        tax_rate?: number;
        notes?: string;
        due_date?: string;
        line_items?: Array<{ description: string; hours: number; rate: number }>;
      };
      const lineItems = (payload.line_items || []).map((item, index) => ({
        id: `line-manual-${index + 1}`,
        description: item.description,
        hours: item.hours,
        rate: item.rate,
        amount: Number((item.hours * item.rate).toFixed(2)),
      }));
      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const total = Number((subtotal * (1 + ((payload.tax_rate || 0) / 100))).toFixed(2));
      const created = {
        id: `invoice-${invoiceList.length + 1}`,
        invoice_number: `INV-20260328-${1000 + invoiceList.length + 1}`,
        client_name: payload.client_name || 'New Client',
        status: 'draft',
        subtotal,
        tax_rate: payload.tax_rate || 0,
        total,
        notes: payload.notes || null,
        due_date: payload.due_date || null,
        created_at: new Date().toISOString(),
        project: mockProjects.find((project) => project.id === payload.project_id) || null,
        line_items: lineItems,
      };
      invoiceList = [created, ...invoiceList];
      return respond(201, created);
    }

    if (path.endsWith('/invoices/autopilot') && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as {
        client_name?: string;
        project_id?: string;
        tax_rate?: number;
      };
      const selectedProject = mockProjects.find((project) => project.id === payload.project_id) || mockProjects[0];
      const created = {
        id: `invoice-${invoiceList.length + 1}`,
        invoice_number: `INV-20260328-${1000 + invoiceList.length + 1}`,
        client_name: payload.client_name || selectedProject.name,
        status: 'draft',
        subtotal: 2400,
        tax_rate: payload.tax_rate || 0,
        total: Number((2400 * (1 + ((payload.tax_rate || 0) / 100))).toFixed(2)),
        notes: 'Generated by billing autopilot from approved billable time entries.',
        due_date: null,
        created_at: new Date().toISOString(),
        project: { id: selectedProject.id, name: selectedProject.name },
        line_items: [
          { id: 'line-auto-1', description: 'Recovered approved work', hours: 16, rate: 150, amount: 2400 },
        ],
      };
      invoiceList = [created, ...invoiceList];
      return respond(201, {
        message: 'Billing autopilot created 1 line items from approved billable work.',
        invoice: created,
      });
    }

    if (/\/invoices\/[^/]+\/status$/.test(path) && method === 'PATCH') {
      const invoiceId = path.split('/').slice(-2)[0];
      const payload = JSON.parse(request.postData() || '{}') as { status?: 'sent' | 'paid' };
      invoiceList = invoiceList.map((invoice) =>
        invoice.id === invoiceId
          ? { ...invoice, status: payload.status || invoice.status }
          : invoice,
      );
      const updated = invoiceList.find((invoice) => invoice.id === invoiceId);
      return respond(200, updated || { success: true });
    }

    if (/\/invoices\/[^/]+$/.test(path) && method === 'DELETE') {
      const invoiceId = path.split('/').pop() as string;
      invoiceList = invoiceList.filter((invoice) => invoice.id !== invoiceId);
      return respond(200, { message: 'Invoice deleted' });
    }

    if (path.includes('/reports/export')) {
      return respond(200, { entries: [], total: 0 });
    }

    if (path.includes('/tags')) {
      return respond(200, { tags: [] });
    }

    return respond(200, {});
  });
};

export const loginWithMockedBackend = async (
  page: Page,
  {
    email = 'employee@webforxtech.com',
    password = 'password123',
    role = 'Employee',
    dismissTour = true,
  }: { email?: string; password?: string; role?: AppRole; dismissTour?: boolean } = {},
) => {
  const submitButtonName = /Continue with Email\/Password|Sign In/i;
  await installStableApiMocks(page, { role });
  await page.goto('/login');
  await page.getByLabel('Work Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: submitButtonName }).click();
  await expect(page).toHaveURL(/.*dashboard/);

  if (dismissTour) {
    const tourOverlay = page.locator('[role="dialog"][aria-label="Product tour"]');
    const skipBtn = page.getByRole('button', { name: 'Skip tour' });
    const tourVisible = await tourOverlay
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (tourVisible && await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
      await expect(tourOverlay).not.toBeVisible({ timeout: 5000 });
    }
  }
};
