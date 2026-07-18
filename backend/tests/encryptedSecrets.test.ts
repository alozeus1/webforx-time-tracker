import { decryptSecret, encryptSecret, looksEncryptedConfig } from '../src/utils/crypto';

describe('encrypted secret helpers', () => {
    it('encrypts MFA and OAuth secrets with AES-GCM format', () => {
        const encrypted = encryptSecret('plain-secret');

        expect(encrypted).not.toBe('plain-secret');
        expect(looksEncryptedConfig(encrypted)).toBe(true);
        expect(decryptSecret(encrypted)).toBe('plain-secret');
    });

    it('keeps legacy plaintext readable for backfill compatibility', () => {
        expect(looksEncryptedConfig('legacy-secret')).toBe(false);
        expect(decryptSecret('legacy-secret')).toBe('legacy-secret');
    });
});
