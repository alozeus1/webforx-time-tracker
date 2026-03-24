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
exports.auditLog = void 0;
const db_1 = __importDefault(require("../config/db"));
const auditLog = (action, resourcePath) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        // We capture the original send to intercept response finish if needed, 
        // but for MVP logging request is sufficient once route is hit.
        if (req.user) {
            try {
                yield db_1.default.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: action,
                        resource: resourcePath || req.originalUrl,
                        metadata: {
                            method: req.method,
                            query: req.query,
                            body: req.method !== 'GET' ? req.body : undefined // Be careful with passwords in real prod
                        }
                    }
                });
            }
            catch (err) {
                console.error('Audit log failed', err);
            }
        }
        next();
    });
};
exports.auditLog = auditLog;
