import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Send, ShieldCheck, Users } from 'lucide-react';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './Login.css';

const REQUEST_ACCESS_EMAIL = 'admin@webforxtech.com';

const RequestAccess: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    workEmail: '',
    company: '',
    teamSize: '1-10',
    details: '',
  });

  usePageMetadata({
    title: 'Request Access | Web Forx Time Tracker',
    description: 'Request access to Web Forx Time Tracker for your team and start tracking projects, approvals, and workload performance.',
    ogTitle: 'Request Access - Web Forx Time Tracker',
    ogDescription: 'Send a workspace access request for your team to Web Forx Time Tracker.',
    canonical: '/request-access',
  });

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const subject = encodeURIComponent(`Access request for ${form.company || 'Web Forx Time Tracker'}`);
    const body = encodeURIComponent(
      [
        'Hello Web Forx team,',
        '',
        'I would like to request access to Web Forx Time Tracker.',
        '',
        `Full name: ${form.fullName}`,
        `Work email: ${form.workEmail}`,
        `Company/Team: ${form.company}`,
        `Team size: ${form.teamSize}`,
        '',
        'Additional details:',
        form.details || 'N/A',
      ].join('\n'),
    );

    window.location.href = `mailto:${REQUEST_ACCESS_EMAIL}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <main id="main-content" className="login-container request-access-page" tabIndex={-1}>
      <div className="login-side-panel">
        <div className="login-side-brand">
          <img src="/webforx-logo.png" alt="Web Forx" className="logo-icon-large logo-icon-large-image" />
          <div>
            <h2>Web Forx Time Tracker</h2>
            <p>Access request for new teams and users</p>
          </div>
        </div>

        <div className="login-side-highlights">
          <div className="side-highlight">
            <Users size={18} />
            <div>
              <strong>Invitation-based onboarding</strong>
              <span>We configure role-based access per team and workspace.</span>
            </div>
          </div>
          <div className="side-highlight">
            <ShieldCheck size={18} />
            <div>
              <strong>Secure account provisioning</strong>
              <span>Admins validate each request before enabling access.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="login-card">
        {!submitted ? (
          <>
            <div className="login-header">
              <p className="login-kicker">Request Access</p>
              <h1>Get Your Team Set Up</h1>
              <p>Tell us about your organization and we will coordinate workspace access.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group icon-input">
                <label className="form-label" htmlFor="request-full-name">Full Name</label>
                <div className="input-wrapper">
                  <Users className="input-icon" size={18} />
                  <input
                    id="request-full-name"
                    className="form-control"
                    type="text"
                    placeholder="Your full name"
                    value={form.fullName}
                    onChange={(event) => handleFieldChange('fullName', event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group icon-input">
                <label className="form-label" htmlFor="request-work-email">Work Email</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" size={18} />
                  <input
                    id="request-work-email"
                    className="form-control"
                    type="email"
                    placeholder="name@company.com"
                    value={form.workEmail}
                    onChange={(event) => handleFieldChange('workEmail', event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group icon-input">
                <label className="form-label" htmlFor="request-company">Company / Team</label>
                <div className="input-wrapper">
                  <Building2 className="input-icon" size={18} />
                  <input
                    id="request-company"
                    className="form-control"
                    type="text"
                    placeholder="Web Forx Technology"
                    value={form.company}
                    onChange={(event) => handleFieldChange('company', event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="request-team-size">Team Size</label>
                <select
                  id="request-team-size"
                  className="form-control"
                  value={form.teamSize}
                  onChange={(event) => handleFieldChange('teamSize', event.target.value)}
                >
                  <option value="1-10">1 - 10 people</option>
                  <option value="11-30">11 - 30 people</option>
                  <option value="31-75">31 - 75 people</option>
                  <option value="76+">76+ people</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="request-details">Additional Details</label>
                <textarea
                  id="request-details"
                  className="form-control"
                  placeholder="Share rollout timeline, role needs, or any onboarding requirements."
                  rows={4}
                  value={form.details}
                  onChange={(event) => handleFieldChange('details', event.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary login-btn">
                <Send size={16} />
                Send Access Request
              </button>
            </form>
          </>
        ) : (
          <div className="request-access-success">
            <div className="request-access-success-icon">
              <ShieldCheck size={28} color="#16a34a" />
            </div>
            <h1>Request Draft Ready</h1>
            <p>
              Your mail client should open with a prefilled request. If it did not,
              send your request details to <a href={`mailto:${REQUEST_ACCESS_EMAIL}`}>{REQUEST_ACCESS_EMAIL}</a>.
            </p>
            <Link to="/login" className="btn btn-primary login-btn">
              Continue to Sign In
            </Link>
          </div>
        )}

        <div className="login-footer">
          <Link to="/login"><ArrowLeft size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Back to Sign In</Link>
          <div className="login-footer-legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default RequestAccess;
