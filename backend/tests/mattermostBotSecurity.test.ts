import { timingSafeTokenEqual } from '../src/controllers/mattermostBotController';

describe('Mattermost callback credential comparison', () => {
    it('accepts only an exact string token', () => {
        expect(timingSafeTokenEqual('configured-token', 'configured-token')).toBe(true);
        expect(timingSafeTokenEqual('configured-token-x', 'configured-token')).toBe(false);
        expect(timingSafeTokenEqual(undefined, 'configured-token')).toBe(false);
        expect(timingSafeTokenEqual({ token: 'configured-token' }, 'configured-token')).toBe(false);
    });
});
