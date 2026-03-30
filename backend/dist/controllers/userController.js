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
exports.updateMe = exports.deleteUser = exports.updateUser = exports.importUsers = exports.createUser = exports.getRoles = exports.getAllUsers = exports.getMyWellbeing = exports.getMyNotifications = exports.getMe = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../config/db"));
const wellbeingService_1 = require("../services/wellbeingService");
const emailService_1 = require("../services/emailService");
const env_1 = require("../config/env");
const requireUserId = (req) => {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new Error('Authenticated user is required');
    }
    return req.user.userId;
};
const ROLE_ALIAS_TO_CANONICAL = {
    admin: 'Admin',
    administrator: 'Admin',
    employee: 'Employee',
    employees: 'Employee',
    staff: 'Employee',
    intern: 'Intern',
    interns: 'Intern',
    manager: 'Manager',
    managers: 'Manager',
    lead: 'Manager',
    leads: 'Manager',
};
const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeEmail = (value) => normalizeString(value).toLowerCase();
const splitName = (value) => {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        return { firstName: '', lastName: '' };
    }
    if (tokens.length === 1) {
        return { firstName: tokens[0], lastName: 'User' };
    }
    return {
        firstName: tokens[0],
        lastName: tokens.slice(1).join(' '),
    };
};
const deriveName = (payload, email) => {
    const firstName = normalizeString(payload.first_name);
    const lastName = normalizeString(payload.last_name);
    if (firstName && lastName) {
        return { firstName, lastName };
    }
    const fullName = normalizeString(payload.full_name) || normalizeString(payload.name);
    if (fullName) {
        return splitName(fullName);
    }
    const emailPrefix = email.split('@')[0] || 'User';
    return splitName(emailPrefix.replace(/[._-]+/g, ' '));
};
const toStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeString(item))
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,;|]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
};
const resolveCanonicalRoleName = (rawRole) => {
    const normalized = rawRole.trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    return ROLE_ALIAS_TO_CANONICAL[normalized] || rawRole.trim();
};
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const hasDatabaseCapacityError = (error) => {
    const message = error instanceof Error ? error.message : String(error !== null && error !== void 0 ? error : '');
    return /connection pool/i.test(message) || /Timed out fetching a new connection/i.test(message);
};
const respondWithUserServiceError = (res, error, fallbackLogMessage) => {
    if (hasDatabaseCapacityError(error)) {
        console.error(`${fallbackLogMessage}: database capacity temporarily unavailable`, error);
        res.status(503).json({ message: 'The service is busy right now. Please try again in a moment.' });
        return;
    }
    console.error(fallbackLogMessage, error);
    res.status(500).json({ message: 'Internal server error' });
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
            weekly_hour_limit: user.weekly_hour_limit,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMe = getMe;
const getMyNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = requireUserId(req);
        const requestedLimit = Number.parseInt(String((_a = req.query.limit) !== null && _a !== void 0 ? _a : '20'), 10);
        const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 20;
        const notifications = yield db_1.default.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            take: limit,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } },
            },
        });
        res.status(200).json({ notifications });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMyNotifications = getMyNotifications;
const getMyWellbeing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const wellbeing = yield (0, wellbeingService_1.getUserWellbeingSummary)(requireUserId(req));
        res.status(200).json(wellbeing);
    }
    catch (error) {
        console.error('Failed to load wellbeing summary:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMyWellbeing = getMyWellbeing;
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
        respondWithUserServiceError(res, error, 'Failed to load users');
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
        respondWithUserServiceError(res, error, 'Failed to load roles');
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
        // Send welcome email (fire-and-forget — never block the response)
        (0, emailService_1.sendWelcomeEmail)({
            to: newUser.email,
            firstName: newUser.first_name,
            defaultPassword: password,
            loginUrl: `${env_1.env.frontendUrl}/login`,
        }).catch((err) => console.error('Failed to send welcome email:', err));
        res.status(201).json(newUser);
    }
    catch (error) {
        respondWithUserServiceError(res, error, 'Failed to create user');
    }
});
exports.createUser = createUser;
const importUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const payload = req.body;
        const users = Array.isArray(payload.users) ? payload.users : [];
        const options = payload.options || {};
        if (users.length === 0) {
            res.status(400).json({ message: 'At least one user row is required for import' });
            return;
        }
        if (users.length > 500) {
            res.status(400).json({ message: 'Import supports up to 500 users per request' });
            return;
        }
        const skipExisting = options.skip_existing !== false;
        const useEmailAsPassword = options.use_email_as_password !== false;
        const actorRole = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || 'Employee';
        const actorUserId = requireUserId(req);
        const roleInProject = normalizeString(options.role_in_project) || 'Team Member';
        const defaultRoleName = resolveCanonicalRoleName(normalizeString(options.default_role) || 'Employee');
        const defaultProjectIdsFromPayload = toStringArray(options.default_project_ids);
        const [roleRecords, projectRecords] = yield Promise.all([
            db_1.default.role.findMany({ select: { id: true, name: true } }),
            db_1.default.project.findMany({ select: { id: true, name: true } }),
        ]);
        const roleByName = new Map();
        roleRecords.forEach((role) => {
            roleByName.set(role.name.toLowerCase(), role);
        });
        const projectById = new Map();
        const projectByName = new Map();
        projectRecords.forEach((project) => {
            projectById.set(project.id, project);
            projectByName.set(project.name.toLowerCase(), project);
        });
        const normalizedDefaultRole = resolveCanonicalRoleName(defaultRoleName);
        const defaultRole = roleByName.get(normalizedDefaultRole.toLowerCase());
        if (!defaultRole) {
            res.status(400).json({ message: `Default role "${defaultRoleName}" is invalid` });
            return;
        }
        const invalidDefaultProjectIds = defaultProjectIdsFromPayload.filter((id) => !projectById.has(id));
        if (invalidDefaultProjectIds.length > 0) {
            res.status(400).json({
                message: `Unknown default project IDs: ${invalidDefaultProjectIds.join(', ')}`,
            });
            return;
        }
        const created = [];
        const skipped = [];
        const failed = [];
        for (const [index, row] of users.entries()) {
            const email = normalizeEmail(row.email);
            const recordLabel = email || `row ${index + 1}`;
            if (!email || !looksLikeEmail(email)) {
                failed.push({ email: recordLabel, reason: 'Invalid or missing email' });
                continue;
            }
            const candidateRoleName = resolveCanonicalRoleName(normalizeString(row.role) || normalizeString(row.user_type) || normalizeString(row.type) || defaultRole.name);
            const roleRecord = roleByName.get(candidateRoleName.toLowerCase());
            if (!roleRecord) {
                failed.push({ email, reason: `Unknown role "${candidateRoleName}"` });
                continue;
            }
            if (actorRole !== 'Admin' && roleRecord.name === 'Admin') {
                failed.push({ email, reason: 'Only admins can import admin users' });
                continue;
            }
            if (skipExisting) {
                const existing = yield db_1.default.user.findUnique({ where: { email }, select: { id: true } });
                if (existing) {
                    skipped.push({ email, reason: 'User already exists' });
                    continue;
                }
            }
            const { firstName, lastName } = deriveName(row, email);
            if (!firstName || !lastName) {
                failed.push({ email, reason: 'Missing name information (first/last/full name)' });
                continue;
            }
            const passwordValue = useEmailAsPassword
                ? email
                : normalizeString(row.password) || email;
            try {
                const password_hash = yield bcryptjs_1.default.hash(passwordValue, yield bcryptjs_1.default.genSalt(10));
                const newUser = yield db_1.default.user.create({
                    data: {
                        email,
                        password_hash,
                        first_name: firstName,
                        last_name: lastName,
                        role_id: roleRecord.id,
                    },
                    select: {
                        id: true,
                        email: true,
                        first_name: true,
                        last_name: true,
                        role: { select: { name: true } },
                    },
                });
                const rowProjectIds = toStringArray(row.project_ids);
                const rowProjectTokens = [
                    ...toStringArray(row.project),
                    ...toStringArray(row.projects),
                    ...toStringArray(row.team),
                ];
                const assignmentSet = new Set(defaultProjectIdsFromPayload);
                rowProjectIds.forEach((projectId) => {
                    if (projectById.has(projectId)) {
                        assignmentSet.add(projectId);
                    }
                });
                rowProjectTokens.forEach((projectToken) => {
                    const byId = projectById.get(projectToken);
                    if (byId) {
                        assignmentSet.add(byId.id);
                        return;
                    }
                    const byName = projectByName.get(projectToken.toLowerCase());
                    if (byName) {
                        assignmentSet.add(byName.id);
                    }
                });
                if (assignmentSet.size > 0) {
                    yield db_1.default.projectMember.createMany({
                        data: Array.from(assignmentSet).map((projectId) => ({
                            project_id: projectId,
                            user_id: newUser.id,
                            role_in_project: roleInProject,
                        })),
                        skipDuplicates: true,
                    });
                }
                created.push({
                    id: newUser.id,
                    email: newUser.email,
                    first_name: newUser.first_name,
                    last_name: newUser.last_name,
                    role: newUser.role.name,
                    assigned_projects: assignmentSet.size,
                });
                // Send welcome email (fire-and-forget)
                (0, emailService_1.sendWelcomeEmail)({
                    to: newUser.email,
                    firstName: newUser.first_name,
                    defaultPassword: passwordValue,
                    loginUrl: `${env_1.env.frontendUrl}/login`,
                }).catch((err) => console.error(`Failed to send welcome email to ${newUser.email}:`, err));
            }
            catch (error) {
                const knownMessage = error.code === 'P2002'
                    ? 'User with this email already exists'
                    : 'Failed to create user';
                failed.push({ email, reason: knownMessage });
            }
        }
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: actorUserId,
                    action: 'users_imported',
                    resource: 'user',
                    metadata: {
                        total: users.length,
                        created: created.length,
                        skipped: skipped.length,
                        failed: failed.length,
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write user import audit log:', error);
        }
        res.status(201).json({
            summary: {
                total: users.length,
                created: created.length,
                skipped: skipped.length,
                failed: failed.length,
            },
            created,
            skipped,
            failed,
        });
    }
    catch (error) {
        respondWithUserServiceError(res, error, 'Failed to import users');
    }
});
exports.importUsers = importUsers;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
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
            // Only Admins may change roles
            if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'Admin') {
                res.status(403).json({ message: 'Only Admin users can change member roles' });
                return;
            }
            // Prevent admins from changing their own role (lockout prevention)
            const requesterId = requireUserId(req);
            if (userId === requesterId) {
                res.status(400).json({ message: 'You cannot change your own role' });
                return;
            }
            let resolvedRoleId;
            try {
                resolvedRoleId = yield resolveRoleId(role_id, role);
            }
            catch (_e) {
                res.status(400).json({ message: 'Invalid role' });
                return;
            }
            // Determine the canonical name of the role being assigned
            const targetRoleRecord = yield db_1.default.role.findUnique({ where: { id: resolvedRoleId }, select: { name: true } });
            const targetRoleName = (_b = targetRoleRecord === null || targetRoleRecord === void 0 ? void 0 : targetRoleRecord.name) !== null && _b !== void 0 ? _b : '';
            // If changing AWAY from Admin, verify at least one other Admin remains
            const currentTarget = yield db_1.default.user.findUnique({
                where: { id: userId },
                select: { role: { select: { name: true } } },
            });
            if (((_c = currentTarget === null || currentTarget === void 0 ? void 0 : currentTarget.role) === null || _c === void 0 ? void 0 : _c.name) === 'Admin' && targetRoleName !== 'Admin') {
                const remainingAdmins = yield db_1.default.user.count({
                    where: {
                        role: { name: 'Admin' },
                        is_active: true,
                        id: { not: userId },
                    },
                });
                if (remainingAdmins === 0) {
                    res.status(400).json({ message: 'Cannot change role: at least one active Admin must remain' });
                    return;
                }
            }
            updateData.role_id = resolvedRoleId;
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
            const isRoleChange = 'role_id' in updateData;
            yield db_1.default.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: isRoleChange ? 'role_changed' : 'user_updated',
                    resource: 'user',
                    metadata: Object.assign({ target_user_id: updatedUser.id, updated_fields: Object.keys(updateData) }, (isRoleChange && { new_role: (_d = updatedUser.role) === null || _d === void 0 ? void 0 : _d.name })),
                },
            });
        }
        catch (error) {
            console.error('Failed to write user update audit log:', error);
        }
        res.status(200).json(updatedUser);
    }
    catch (error) {
        respondWithUserServiceError(res, error, 'Failed to update user');
    }
});
exports.updateUser = updateUser;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userIdParam = req.params.id;
        const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
        if (!userId) {
            res.status(400).json({ message: 'User id is required' });
            return;
        }
        if (userId === requireUserId(req)) {
            res.status(400).json({ message: 'Cannot delete your own account' });
            return;
        }
        const target = yield db_1.default.user.findUnique({ where: { id: userId } });
        if (!target) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        // Soft-delete: deactivate + anonymize
        yield db_1.default.user.update({
            where: { id: userId },
            data: { is_active: false },
        });
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_deleted',
                    resource: 'user',
                    metadata: { target_user_id: userId, target_email: target.email },
                },
            });
        }
        catch (error) {
            console.error('Failed to write user deletion audit log:', error);
        }
        res.status(200).json({ message: 'User deactivated successfully' });
    }
    catch (error) {
        respondWithUserServiceError(res, error, 'Failed to delete user');
    }
});
exports.deleteUser = deleteUser;
const updateMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = requireUserId(req);
        const { first_name, last_name, password, weekly_hour_limit } = req.body;
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
        if (weekly_hour_limit !== undefined) {
            updateData.weekly_hour_limit = weekly_hour_limit === null ? null : parseInt(String(weekly_hour_limit), 10) || null;
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
            weekly_hour_limit: updatedUser.weekly_hour_limit,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateMe = updateMe;
