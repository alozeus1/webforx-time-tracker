import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './PublicLegal.css';

const Terms: React.FC = () => {
  usePageMetadata({
    title: 'Terms of Service | Web Forx Time Tracker',
    description: 'Read the Web Forx Time Tracker terms covering acceptable use, account responsibilities, and service availability.',
    ogTitle: 'Terms of Service - Web Forx Time Tracker',
    ogDescription: 'Understand usage terms, workspace responsibilities, and platform policies for Web Forx Time Tracker.',
    canonical: '/terms',
  });

  return (
    <div className="public-page-shell">
      <header className="public-page-header">
        <div className="public-page-header-inner">
          <Link to="/landing" className="public-page-brand">
            <img src="/webforx-logo.png" alt="Web Forx logo" />
            <span>Web Forx Time Tracker</span>
          </Link>
          <nav className="public-page-links" aria-label="Public navigation">
            <Link to="/landing">Product</Link>
            <Link to="/request-access">Request Access</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/login">Sign In</Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="public-page-main" tabIndex={-1}>
        <article className="public-page-card">
          <p className="public-page-kicker">Legal</p>
          <h1>Terms of Service</h1>
          <p className="public-page-last-updated">Last updated: March 28, 2026</p>

          <section>
            <h2>Use of the Service</h2>
            <p>
              Web Forx Time Tracker is an access-controlled business application. Use is limited to users
              authorized by their organization. You agree to use the platform only for lawful business operations
              and in accordance with your company policies.
            </p>
          </section>

          <section>
            <h2>Account Responsibilities</h2>
            <ul>
              <li>Maintain accurate account information and safeguard login credentials.</li>
              <li>Do not share credentials or attempt to access unauthorized workspace data.</li>
              <li>Report suspected account compromise to your admin without delay.</li>
            </ul>
          </section>

          <section>
            <h2>Data and Content Ownership</h2>
            <p>
              Time entries, project mappings, and team records remain owned by the customer organization.
              Web Forx may process this data only as needed to operate, secure, and improve the service.
            </p>
          </section>

          <section>
            <h2>Service Availability</h2>
            <p>
              We aim for high availability and operational continuity, but uninterrupted access cannot be guaranteed.
              Maintenance windows, security events, and third-party outages may temporarily impact service access.
            </p>
          </section>

          <section>
            <h2>Policy Updates</h2>
            <p>
              Terms may be updated as product capabilities evolve. Material changes will be reflected on this page
              with a revised effective date.
            </p>
          </section>

          <p className="public-page-footer">
            Questions: <a href="mailto:admin@webforxtech.com">admin@webforxtech.com</a> · Related: <Link to="/privacy">Privacy Policy</Link>
          </p>
        </article>
      </main>
    </div>
  );
};

export default Terms;
