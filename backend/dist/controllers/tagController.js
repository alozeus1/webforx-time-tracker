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
exports.deleteTag = exports.createTag = exports.listTags = void 0;
const db_1 = __importDefault(require("../config/db"));
const listTags = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tags = yield db_1.default.tag.findMany({ orderBy: { name: 'asc' } });
        res.status(200).json({ tags });
    }
    catch (error) {
        console.error('Failed to list tags:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.listTags = listTags;
const createTag = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const name = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) === 'string' ? req.body.name.trim() : '';
        const color = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.color) === 'string' ? req.body.color.trim() : '#6366f1';
        if (!name) {
            res.status(400).json({ message: 'Tag name is required' });
            return;
        }
        const existing = yield db_1.default.tag.findUnique({ where: { name } });
        if (existing) {
            res.status(409).json({ message: 'Tag already exists' });
            return;
        }
        const tag = yield db_1.default.tag.create({ data: { name, color } });
        res.status(201).json(tag);
    }
    catch (error) {
        console.error('Failed to create tag:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createTag = createTag;
const deleteTag = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        yield db_1.default.tag.delete({ where: { id } });
        res.status(200).json({ message: 'Tag deleted' });
    }
    catch (error) {
        if (error.code === 'P2025') {
            res.status(404).json({ message: 'Tag not found' });
            return;
        }
        console.error('Failed to delete tag:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteTag = deleteTag;
