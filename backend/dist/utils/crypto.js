"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptConfig = exports.encryptConfig = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const key = crypto_1.default.createHash('sha256').update(env_1.env.integrationSecret).digest();
const encryptConfig = (value) => {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};
exports.encryptConfig = encryptConfig;
const decryptConfig = (value) => {
    const [ivHex, tagHex, encryptedHex] = value.split(':');
    if (!ivHex || !tagHex || !encryptedHex) {
        throw new Error('Invalid encrypted integration config format');
    }
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
};
exports.decryptConfig = decryptConfig;
