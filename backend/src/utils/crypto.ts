import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

const key = crypto.createHash('sha256').update(env.integrationSecret).digest();

export const encryptConfig = (value: unknown): string => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptConfig = <T>(value: string): T => {
    const [ivHex, tagHex, encryptedHex] = value.split(':');

    if (!ivHex || !tagHex || !encryptedHex) {
        throw new Error('Invalid encrypted integration config format');
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivHex, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8')) as T;
};
