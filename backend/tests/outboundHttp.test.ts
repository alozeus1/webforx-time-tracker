import dns from 'dns/promises';
import { validatePublicHttpsUrl } from '../src/utils/outboundHttp';

jest.mock('dns/promises', () => ({
    lookup: jest.fn(),
}));

const lookupMock = dns.lookup as jest.Mock;

describe('outbound HTTP URL validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects loopback and private webhook targets', async () => {
        await expect(validatePublicHttpsUrl('https://127.0.0.1/hook')).rejects.toThrow(/public address/i);

        lookupMock.mockResolvedValue([{ address: '10.0.0.5' }]);
        await expect(validatePublicHttpsUrl('https://hooks.example.com/hook')).rejects.toThrow(/public address/i);
    });

    it('requires HTTPS and accepts public addresses', async () => {
        await expect(validatePublicHttpsUrl('http://hooks.example.com/hook')).rejects.toThrow(/HTTPS/i);

        lookupMock.mockResolvedValue([{ address: '198.51.100.10' }]);
        await expect(validatePublicHttpsUrl('https://hooks.example.com/hook')).resolves.toMatchObject({
            hostname: 'hooks.example.com',
        });
    });
});
