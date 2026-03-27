"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.logout = exports.login = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../config/db"));
const env_1 = require("../config/env");
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const email = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.email) === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.password) === 'string' ? req.body.password : '';
        if (!email || !password) {
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }
        const user = yield db_1.default.user.findUnique({
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
        const isValidPassword = yield bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role.name }, env_1.env.jwtSecret, { expiresIn: '24h' });
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.login = login;
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(200).json({ message: 'Logged out successfully' });
});
exports.logout = logout;
const forgotPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const email = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.email) === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (!email) {
            res.status(400).json({ message: 'Email is required' });
            return;
        }
        const user = yield db_1.default.user.findUnique({ where: { email } });
        // Always return success to prevent email enumeration
        if (!user) {
            res.status(200).json({ message: 'If that email exists, a reset code has been generated.' });
            return;
        }
        // Invalidate any existing tokens for this user
        yield db_1.default.passwordResetToken.updateMany({
            where: { user_id: user.id, used: false },
            data: { used: true },
        });
        const token = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
        const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        yield db_1.default.passwordResetToken.create({
            data: { user_id: user.id, token, expires_at },
        });
        console.log(`[auth] Password reset code for ${email}: ${token}`);
        res.status(200).json({
            message: 'If that email exists, a reset code has been generated.',
            reset_code: token,
        });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.forgotPassword = forgotPassword;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const code = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.code) === 'string' ? req.body.code.trim().toUpperCase() : '';
        const newPassword = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.password) === 'string' ? req.body.password : '';
        if (!code || !newPassword) {
            res.status(400).json({ message: 'Reset code and new password are required' });
            return;
        }
        if (newPassword.length < 6) {
            res.status(400).json({ message: 'Password must be at least 6 characters' });
            return;
        }
        const resetToken = yield db_1.default.passwordResetToken.findUnique({
            where: { token: code },
            include: { user: true },
        });
        if (!resetToken || resetToken.used || resetToken.expires_at < new Date()) {
            res.status(400).json({ message: 'Invalid or expired reset code' });
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const password_hash = yield bcryptjs_1.default.hash(newPassword, salt);
        yield db_1.default.user.update({
            where: { id: resetToken.user_id },
            data: { password_hash },
        });
        yield db_1.default.passwordResetToken.update({
            where: { id: resetToken.id },
            data: { used: true },
        });
        res.status(200).json({ message: 'Password has been reset successfully' });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.resetPassword = resetPassword;
