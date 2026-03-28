import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './PublicLegal.css';

const Privacy: React.FC = () => {
  usePageMetadata({
    title: 'Privacy Policy | Web Forx Time Tracker',
    description: 'Review how Web Forx Time Tracker handles account data, usage logs, and operational security for workspace users.',
    ogTitle: 'Privacy Policy - Web Forx Time Tracker',
    ogDescription: 'Understand how user and workspace data is processed in Web Forx Time Tracker.',
    canonical: '/privacy',
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
            <Link to="/terms">Terms</Link>
            <Link to="/login">Sign In</Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="public-page-main" tabIndex={-1}>
        <article className="public-page-card">
          <p className="public-page-kicker">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="public-page-last-updated">Last updated: March 28, 2026</p>

          <section>
            <h2>Overview</h2>
            <p>
              Web Forx Time Tracker is designed for internal workforce operations. This policy describes how
              account information, time records, and operational telemetry are processed to deliver secure
              time tracking, approvals, and reporting for authorized organizations.
            </p>
          </section>

          <section>
            <h2>Data We Process</h2>
            <ul>
              <li>Account profile details such as name, work email, and assigned role.</li>
              <li>Time entries, active timer sessions, and project/task associations.</li>
              <li>Workspace configuration and integration settings managed by admins.</li>
              <li>Security and audit logs required for monitoring, troubleshooting, and compliance.</li>
            </ul>
          </section>

          <section>
            <h2>How Data Is Used</h2>
            <p>
              Data is used to provide core product functionality, enforce role-based access, support approvals,
              generate reports, and protect service integrity. We do not sell user data, and access is restricted
              to authorized personnel and delegated administrators.
            </p>
          </section>

          <section>
            <h2>Retention and Security</h2>
            <p>
              Records are retained based on organizational policy and operational requirements. Web Forx Time Tracker
              applies authentication controls, encrypted transport, and audit visibility to reduce unauthorized access
              risk. Workspace admins are responsible for reviewing user access on a recurring basis.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about this policy can be sent to <a href="mailto:admin@webforxtech.com">admin@webforxtech.com</a>.
            </p>
          </section>

          <p className="public-page-footer">
            Related: <Link to="/terms">Terms of Service</Link>
          </p>
        </article>
      </main>
    </div>
  );
};

export default Privacy;
