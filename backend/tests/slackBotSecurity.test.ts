import crypto from 'crypto';
import { verifySlackSignature } from '../src/controllers/slackBotController';

const secret = 'test-signing-secret';
const body = 'user_id=U123&text=status';

const signatureFor = (timestamp: string) => (
    `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`
);

describe('Slack callback signature verification', () => {
    it('accepts a current correctly signed request', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        expect(verifySlackSignature(secret, body, timestamp, signatureFor(timestamp))).toBe(true);
    });

    it('rejects malformed or stale timestamps before command processing', () => {
        expect(verifySlackSignature(secret, body, 'not-a-timestamp', signatureFor('not-a-timestamp'))).toBe(false);
        const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
        expect(verifySlackSignature(secret, body, staleTimestamp, signatureFor(staleTimestamp))).toBe(false);
    });

    it('rejects an invalid signature', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        expect(verifySlackSignature(secret, body, timestamp, 'v0=invalid')).toBe(false);
    });
});
