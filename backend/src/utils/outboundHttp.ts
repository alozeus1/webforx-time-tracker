import dns from 'dns/promises';
import net from 'net';

const PRIVATE_IPV4_RANGES = [
    ['10.0.0.0', 8],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['0.0.0.0', 8],
    ['100.64.0.0', 10],
    ['224.0.0.0', 4],
] as const;

const ipv4ToInt = (ip: string) =>
    ip.split('.').reduce((acc, part) => (acc << 8) + Number.parseInt(part, 10), 0) >>> 0;

const isPrivateIpv4 = (ip: string): boolean => {
    const value = ipv4ToInt(ip);
    return PRIVATE_IPV4_RANGES.some(([range, bits]) => {
        const mask = (0xffffffff << (32 - bits)) >>> 0;
        return (value & mask) === (ipv4ToInt(range) & mask);
    });
};

const isBlockedIp = (ip: string): boolean => {
    const version = net.isIP(ip);
    if (version === 4) return isPrivateIpv4(ip);
    if (version === 6) {
        const normalized = ip.toLowerCase();
        return normalized === '::1'
            || normalized === '::'
            || normalized.startsWith('fc')
            || normalized.startsWith('fd')
            || normalized.startsWith('fe80:')
            || normalized.startsWith('ff');
    }
    return true;
};

export const validatePublicHttpsUrl = async (value: string): Promise<URL> => {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('URL is invalid');
    }

    if (parsed.protocol !== 'https:') {
        throw new Error('URL must use HTTPS');
    }

    if (parsed.username || parsed.password) {
        throw new Error('URL credentials are not allowed');
    }

    const addresses = net.isIP(parsed.hostname)
        ? [{ address: parsed.hostname }]
        : await dns.lookup(parsed.hostname, { all: true, verbatim: true });

    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
        throw new Error('URL must resolve to a public address');
    }

    return parsed;
};

export const publicHttpsFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const parsed = await validatePublicHttpsUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        return await fetch(parsed.toString(), {
            ...init,
            redirect: 'manual',
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
};
