import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listOrganizations = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Only super-admins can list all orgs; regular admins see only their own
    const orgs = await prisma.organization.findMany({
      where: _req.user?.role === 'Admin' && _req.user?.organization_id
        ? { id: _req.user.organization_id }
        : undefined,
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
    const org = await prisma.organization.update({
      where: { id: req.user!.organization_id },
      data: req.body,
    });
    res.status(200).json(org);
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
