import { describe, expect, it } from 'vitest';
import manifestRaw from '../../public/manifest.json?raw';
import landingRaw from '../pages/Landing.tsx?raw';
import privacyRaw from '../pages/Privacy.tsx?raw';
import termsRaw from '../pages/Terms.tsx?raw';

describe('public trust content', () => {
    it('does not publish unsupported volume or approval-time claims', () => {
        expect(landingRaw).not.toContain('25K+');
        expect(landingRaw).not.toContain('150+');
        expect(landingRaw).not.toContain('< 8 hrs');
        expect(landingRaw).toContain("value: 'Role-based'");
        expect(landingRaw).toContain("value: 'Audit-ready'");
        expect(landingRaw).toContain("value: 'Export-ready'");
    });

    it('does not expose the legacy screenshot gallery or PWA screenshot', () => {
        expect(landingRaw).not.toContain('galleryImages');
        expect(landingRaw).not.toContain('id="gallery"');
        expect(JSON.parse(manifestRaw)).not.toHaveProperty('screenshots');
    });

    it('uses the product and company legal names consistently', () => {
        expect(landingRaw).toContain('Web Forx Time Tracker');
        expect(landingRaw).toContain('Web Forx Global Inc.');
        expect(privacyRaw).toContain('operated by Web Forx Global Inc.');
        expect(termsRaw).toContain('Web Forx Global Inc. may process');
    });
});
