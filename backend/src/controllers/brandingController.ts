/**
 * White-labeling — Standard tier
 *
 * Org admins can set: app_name, logo_url, favicon_url, primary_color,
 * secondary_color, custom_domain, email_from_name, email_from_address.
 *
 * Public endpoint: GET /api/v1/branding/public?slug=<org_slug>
 *   Used by the frontend to load branding before login (custom domains).
 *
 * Protected endpoints (Admin only):
 *   GET  /api/v1/branding        — get own org branding
 *   PUT  /api/v1/branding        — update own org branding
 *   DELETE /api/v1/branding      — reset to defaults
 */
import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// ---------------------------------------------------------------------------
// GET /api/v1/branding/public?slug=<orgSlug>
// ---------------------------------------------------------------------------
export const getPublicBranding = async (req: Request, res: Response): Promise<void> => {
    const slug = req.query.slug as string;
    if (!slug) {
        res.status(400).json({ message: 'slug query param required.' });
        return;
    }
    try {
        const org = await prisma.organization.findUnique({
            where: { slug },
            select: { id: true, name: true, status: true },
        });
        if (!org || org.status !== 'active') {
            res.status(404).json({ message: 'Organisation not found.' });
            return;
        }
        // db is cast to any until `prisma generate` is run locally (Vercel regenerates automatically)
        const branding = await db.brandingConfig.findUnique({ where: { organization_id: org.id } });
        res.status(200).json({
            org_name: org.name,
            branding: branding ?? null,
        });
    } catch (error) {
        console.error('[branding] getPublicBranding error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/v1/branding  — Admin: get own org's branding config
// ---------------------------------------------------------------------------
export const getBranding = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const branding = await db.brandingConfig.findUnique({ where: { organization_id: orgId } });
        res.status(200).json(branding ?? null);
    } catch (error) {
        console.error('[branding] getBranding error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// PUT /api/v1/branding  — Admin: upsert branding config
// ---------------------------------------------------------------------------
export const upsertBranding = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const {
            app_name,
            logo_url,
            favicon_url,
            primary_color,
            secondary_color,
            custom_domain,
            email_from_name,
            email_from_address,
        } = req.body ?? {};

        // Validate colours
        if (primary_color !== undefined && !HEX_COLOR_RE.test(primary_color)) {
            res.status(400).json({ message: 'primary_color must be a valid 6-digit hex colour (e.g. #4F46E5).' });
            return;
        }
        if (secondary_color !== undefined && !HEX_COLOR_RE.test(secondary_color)) {
            res.status(400).json({ message: 'secondary_color must be a valid 6-digit hex colour.' });
            return;
        }

        // Basic domain validation
        if (custom_domain !== undefined && custom_domain !== null && custom_domain !== '') {
            const domainRe = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i;
            if (!domainRe.test(custom_domain)) {
                res.status(400).json({ message: 'custom_domain must be a valid domain name (e.g. timer.acme.com).' });
                return;
            }
        }

        const data: Record<string, string | null> = {};
        if (app_name !== undefined) data.app_name = app_name || null;
        if (logo_url !== undefined) data.logo_url = logo_url || null;
        if (favicon_url !== undefined) data.favicon_url = favicon_url || null;
        if (primary_color !== undefined) data.primary_color = primary_color;
        if (secondary_color !== undefined) data.secondary_color = secondary_color;
        if (custom_domain !== undefined) data.custom_domain = custom_domain || null;
        if (email_from_name !== undefined) data.email_from_name = email_from_name || null;
        if (email_from_address !== undefined) data.email_from_address = email_from_address || null;

        const branding = await db.brandingConfig.upsert({
            where: { organization_id: orgId },
            create: { organization_id: orgId, ...data },
            update: data,
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: req.user!.userId,
                    organization_id: orgId,
                    action: 'branding_updated',
                    resource: 'branding_config',
                    metadata: { fields_updated: Object.keys(data) },
                },
            });
        } catch (e) {
            console.error('[branding] audit log failed:', e);
        }

        res.status(200).json(branding);
    } catch (error) {
        console.error('[branding] upsertBranding error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// DELETE /api/v1/branding  — Admin: reset to defaults
// ---------------------------------------------------------------------------
export const resetBranding = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        await db.brandingConfig.deleteMany({ where: { organization_id: orgId } });
        res.status(200).json({ message: 'Branding reset to defaults.' });
    } catch (error) {
        console.error('[branding] resetBranding error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
