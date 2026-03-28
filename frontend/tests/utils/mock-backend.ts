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
      return respond(200, [roleToUser(configuredRole)]);
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
      return respond(201, { id: 'user-new', ...roleToUser(configuredRole) });
    }

    if (/\/users\/[^/]+$/.test(path) && ['PUT', 'DELETE'].includes(method)) {
      return respond(200, { success: true });
    }

    if (path.endsWith('/users/me/notifications')) {
      return respond(200, { notifications: [] });
    }

    if (path.endsWith('/admin/notifications')) {
      return respond(200, { notifications: [] });
    }

    if (path.endsWith('/projects') && method === 'GET') {
      return respond(200, mockProjects);
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

      return respond(200, { entries: [], activeTimer });
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

    if (path.includes('/reports/export')) {
      return respond(200, { entries: [], total: 0 });
    }

    if (path.includes('/notifications') || path.includes('/tags')) {
      return respond(200, []);
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
  await installStableApiMocks(page, { role });
  await page.goto('/login');
  await page.getByLabel('Work Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
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
