import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listOrganizations = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgs = await prisma.organization.findMany({
      where: { id: _req.user!.organization_id },
      orderBy: { created_at: 'desc' },
    });
    res.status(200).json(orgs);
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user!.organization_id },
    });
    if (!org) {
      res.status(404).json({ message: 'Organization not found' });
      return;
    }
    res.status(200).json(org);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createOrganization = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, billing_email } = req.body;
    const org = await prisma.organization.create({
      data: { name, slug, billing_email },
    });
    // Seed default roles for the new organization
    const roles = ['Admin', 'Manager', 'Employee', 'Intern'];
    await prisma.role.createMany({
      data: roles.map((name) => ({ name, organization_id: org.id })),
      skipDuplicates: true,
    });
    res.status(201).json(org);
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data: {
      name?: string;
      billing_email?: string | null;
      settings?: Prisma.InputJsonValue;
    } = {};

    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      data.name = req.body.name.trim();
    }
    if ('billing_email' in (req.body || {})) {
      data.billing_email = typeof req.body.billing_email === 'string' && req.body.billing_email.trim()
        ? req.body.billing_email.trim()
        : null;
    }
    if ('settings' in (req.body || {})) {
      data.settings = req.body.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)
        ? req.body.settings as Prisma.InputJsonValue
        : {};
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ message: 'No valid organization fields provided' });
      return;
    }

    const org = await prisma.organization.update({
      where: { id: req.user!.organization_id },
      data,
    });
    res.status(200).json(org);
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
