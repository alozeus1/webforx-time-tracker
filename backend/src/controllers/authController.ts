import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!email || !password) {
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true }
        });

        if (!user) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        if (!user.is_active) {
            res.status(401).json({ message: 'Account disabled' });
            return;
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role.name },
            env.jwtSecret,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ message: 'Logged out successfully' });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

        if (!email) {
            res.status(400).json({ message: 'Email is required' });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Always return success to prevent email enumeration
        if (!user) {
            res.status(200).json({ message: 'If that email exists, a reset code has been generated.' });
            return;
        }

        // Invalidate any existing tokens for this user
        await prisma.passwordResetToken.updateMany({
            where: { user_id: user.id, used: false },
            data: { used: true },
        });

        const token = crypto.randomBytes(4).toString('hex').toUpperCase();
        const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        await prisma.passwordResetToken.create({
            data: { user_id: user.id, token, expires_at },
        });

        console.log(`[auth] Password reset code for ${email}: ${token}`);

        res.status(200).json({
            message: 'If that email exists, a reset code has been generated.',
            reset_code: token,
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
        const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!code || !newPassword) {
            res.status(400).json({ message: 'Reset code and new password are required' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ message: 'Password must be at least 6 characters' });
            return;
        }

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token: code },
            include: { user: true },
        });

        if (!resetToken || resetToken.used || resetToken.expires_at < new Date()) {
            res.status(400).json({ message: 'Invalid or expired reset code' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: resetToken.user_id },
            data: { password_hash },
        });

        await prisma.passwordResetToken.update({
            where: { id: resetToken.id },
            data: { used: true },
        });

        res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
