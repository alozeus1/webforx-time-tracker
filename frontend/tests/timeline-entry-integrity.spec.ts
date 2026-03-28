import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Timeline Entry Integrity', () => {
    test('editing a short entry preserves its project selection and can be saved', async ({ page }) => {
        const startTime = new Date('2026-03-28T09:00:05.000Z');
        const endTime = new Date('2026-03-28T09:00:43.000Z');
        let updatePayload: Record<string, unknown> | null = null;

        await loginWithMockedBackend(page, {
            email: 'admin@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Admin',
            dismissTour: true,
        });

        await page.route('**/api/v1/timers/me', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    entries: [
                        {
                            id: 'entry-short',
                            task_description: 'Quick QA note',
                            duration: 38,
                            start_time: startTime.toISOString(),
                            end_time: endTime.toISOString(),
                            status: 'pending',
                            user: {
                                id: 'admin-1',
                                email: 'admin@webforxtech.com',
                                first_name: 'Amina',
                                last_name: 'Bello',
                                is_active: true,
                                role: { name: 'Admin' },
                            },
                            project: {
                                id: 'proj-1',
                                name: 'Platform Engineering',
                            },
                        },
                    ],
                    activeTimer: null,
                }),
            });
        });

        await page.route('**/api/v1/timers/entry-short', async (route) => {
            updatePayload = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        });

        await page.goto('/timeline');
        await expect(page).toHaveURL(/.*timeline/);

        await page.getByTitle('Edit entry').click();

        const dialog = page.getByRole('heading', { name: 'Edit Entry' });
        await expect(dialog).toBeVisible();

        const projectSelect = page.locator('select').filter({ has: page.getByRole('option', { name: 'Platform Engineering' }) }).last();
        await expect(projectSelect).toHaveValue('proj-1');

        await page.getByRole('button', { name: 'Save Changes' }).click();

        await expect(page.getByRole('button', { name: 'Save Changes' })).not.toBeVisible();
        expect(updatePayload).not.toBeNull();
        expect(updatePayload?.project_id).toBe('proj-1');
        expect(updatePayload?.start_time).toBe(startTime.toISOString());
        expect(updatePayload?.end_time).toBe(endTime.toISOString());
    });
});
