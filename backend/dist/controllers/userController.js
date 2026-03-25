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
exports.updateMe = exports.updateUser = exports.createUser = exports.getRoles = exports.getAllUsers = exports.getMe = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../config/db"));
const requireUserId = (req) => {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new Error('Authenticated user is required');
    }
    return req.user.userId;
};
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield db_1.default.user.findUnique({
            where: { id: requireUserId(req) },
            include: { role: true },
        });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.status(200).json({
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role.name,
            is_active: user.is_active,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMe = getMe;
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield db_1.default.user.findMany({
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });
        res.status(200).json(users);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getAllUsers = getAllUsers;
const getRoles = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const roles = yield db_1.default.role.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        res.status(200).json({ roles });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getRoles = getRoles;
const resolveRoleId = (roleId, roleName) => __awaiter(void 0, void 0, void 0, function* () {
    if (roleId === null || roleId === void 0 ? void 0 : roleId.trim()) {
        return roleId.trim();
    }
    if (roleName === null || roleName === void 0 ? void 0 : roleName.trim()) {
        const role = yield db_1.default.role.findUnique({ where: { name: roleName.trim() } });
        if (!role) {
            throw new Error('Invalid role');
        }
        return role.id;
    }
    throw new Error('Role is required');
});
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, first_name, last_name, role_id, role } = req.body;
        if (!email || !password || !first_name || !last_name) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }
        const existingUser = yield db_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: 'User with this email already exists' });
            return;
        }
        let resolvedRoleId;
        try {
            resolvedRoleId = yield resolveRoleId(role_id, role);
        }
        catch (error) {
            res.status(400).json({ message: 'Invalid or missing role' });
            return;
        }
        const salt = yield bcryptjs_1.default.genSalt(10);
        const password_hash = yield bcryptjs_1.default.hash(password, salt);
        const newUser = yield db_1.default.user.create({
            data: {
                email,
                password_hash,
                first_name,
                last_name,
                role_id: resolvedRoleId,
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_created',
                    resource: 'user',
                    metadata: {
                        target_user_id: newUser.id,
                        target_email: newUser.email,
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write user creation audit log:', error);
        }
        res.status(201).json(newUser);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createUser = createUser;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userIdParam = req.params.id;
        const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
        const { first_name, last_name, email, password, role_id, role, is_active } = req.body;
        if (!userId) {
            res.status(400).json({ message: 'User id is required' });
            return;
        }
        const updateData = {};
        if (typeof first_name === 'string' && first_name.trim()) {
            updateData.first_name = first_name.trim();
        }
        if (typeof last_name === 'string' && last_name.trim()) {
            updateData.last_name = last_name.trim();
        }
        if (typeof email === 'string' && email.trim()) {
            updateData.email = email.trim().toLowerCase();
        }
        if (typeof is_active === 'boolean') {
            updateData.is_active = is_active;
        }
        if (typeof password === 'string' && password.trim()) {
            const salt = yield bcryptjs_1.default.genSalt(10);
            updateData.password_hash = yield bcryptjs_1.default.hash(password.trim(), salt);
        }
        if ((typeof role_id === 'string' && role_id.trim()) || (typeof role === 'string' && role.trim())) {
            try {
                updateData.role_id = yield resolveRoleId(role_id, role);
            }
            catch (error) {
                res.status(400).json({ message: 'Invalid role' });
                return;
            }
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided for update' });
            return;
        }
        const updatedUser = yield db_1.default.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_updated',
                    resource: 'user',
                    metadata: {
                        target_user_id: updatedUser.id,
                        updated_fields: Object.keys(updateData),
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write user update audit log:', error);
        }
        res.status(200).json(updatedUser);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateUser = updateUser;
const updateMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = requireUserId(req);
        const { first_name, last_name, password } = req.body;
        const updateData = {};
        if (typeof first_name === 'string' && first_name.trim()) {
            updateData.first_name = first_name.trim();
        }
        if (typeof last_name === 'string' && last_name.trim()) {
            updateData.last_name = last_name.trim();
        }
        if (typeof password === 'string' && password.trim()) {
            const salt = yield bcryptjs_1.default.genSalt(10);
            updateData.password_hash = yield bcryptjs_1.default.hash(password.trim(), salt);
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided for update' });
            return;
        }
        const updatedUser = yield db_1.default.user.update({
            where: { id: userId },
            data: updateData,
            include: { role: true },
        });
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: userId,
                    action: 'profile_updated',
                    resource: 'user',
                    metadata: {
                        updated_fields: Object.keys(updateData),
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write profile update audit log:', error);
        }
        res.status(200).json({
            id: updatedUser.id,
            email: updatedUser.email,
            first_name: updatedUser.first_name,
            last_name: updatedUser.last_name,
            role: updatedUser.role.name,
            is_active: updatedUser.is_active,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateMe = updateMe;
