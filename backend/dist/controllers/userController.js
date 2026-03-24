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
exports.createUser = exports.getAllUsers = exports.getMe = void 0;
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
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, first_name, last_name, role_id } = req.body;
        const existingUser = yield db_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: 'User with this email already exists' });
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
                role_id,
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
            },
        });
        res.status(201).json(newUser);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createUser = createUser;
