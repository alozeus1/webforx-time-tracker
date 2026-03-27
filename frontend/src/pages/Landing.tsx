import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Clock, Calendar, FileText, BarChart2, Users,
  ShieldCheck, Box, CheckCircle2, ArrowRight,
  Eye, Briefcase, UserCheck, Zap,
} from 'lucide-react';
import './Landing.css';

/* ───────────────────── static data ───────────────────── */

const features = [
  {
    icon: <LayoutDashboard size={20} />,
    title: 'Dashboard Insights',
    biz: 'See team productivity at a glance with real-time summaries.',
    ops: 'Daily totals, active timers, and project breakdowns in one view.',
  },
  {
    icon: <Clock size={20} />,
    title: 'Live Timer',
    biz: 'Capture every billable minute as work happens.',
    ops: 'One-click start/stop timer with task and project assignment.',
  },
  {
    icon: <Calendar size={20} />,
    title: 'Timeline View',
    biz: 'Understand how each day is spent across your team.',
    ops: 'Chronological entry list with daily analytics and navigation.',
  },
  {
    icon: <FileText size={20} />,
    title: 'Weekly Timesheet',
    biz: 'Streamline approvals with structured weekly summaries.',
    ops: 'Aggregated project/day grid with totals ready for export.',
  },
  {
    icon: <BarChart2 size={20} />,
    title: 'Reports & Analytics',
    biz: 'Make data-driven decisions with detailed performance metrics.',
    ops: 'Filter by team, project, or date range; export for payroll or billing.',
  },
  {
    icon: <Users size={20} />,
    title: 'Team Management',
    biz: 'Keep your workforce organized and accountable.',
    ops: 'Invite members, assign roles, manage projects and tasks.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Admin Controls',
    biz: 'Maintain governance with role-based access and org settings.',
    ops: 'Organization config, audit visibility, and approval workflows.',
  },
  {
    icon: <Box size={20} />,
    title: 'Integrations',
    biz: 'Connect your existing tools for a seamless workflow.',
    ops: 'Sync with Google Calendar, Taiga, and more.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Session Security',
    biz: 'Protect sensitive time and billing data.',
    ops: 'JWT-based auth, role enforcement, and secure session handling.',
  },
];

const steps = [
  { num: 1, title: 'Sign In', desc: 'Log in with your work email to access your dashboard.' },
  { num: 2, title: 'Start Tracking', desc: 'Launch the timer or create a manual time entry for your task.' },
  { num: 3, title: 'Assign Work', desc: 'Link each entry to a project and task for accurate categorization.' },
  { num: 4, title: 'View Progress', desc: 'Check your dashboard for daily totals, goals, and active timers.' },
  { num: 5, title: 'Submit Timesheet', desc: 'Review your weekly timesheet and submit for manager approval.' },
  { num: 6, title: 'Review & Report', desc: 'Managers and admins review reports, approve time, and track team output.' },
];

const demoTabs = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    title: 'Dashboard',
    desc: 'Your command center. See today\'s tracked hours, active timer status, recent entries, top projects by time spent, and pending notifications — all in one view.',
    highlights: ['Daily hours summary', 'Active timer status', 'Project breakdown', 'Manager notifications'],
  },
  {
    key: 'timer',
    label: 'Timer',
    icon: <Clock size={16} />,
    title: 'Timer',
    desc: 'Start tracking with a single click. Assign a task description, select a project, and let the live timer capture your work as it happens.',
    highlights: ['One-click start/stop', 'Task description', 'Project assignment', 'Daily progress bar'],
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: <Calendar size={16} />,
    title: 'Timeline',
    desc: 'Review your day in chronological order. Navigate between dates, see entry details, and understand how your hours are distributed.',
    highlights: ['Date navigation', 'Chronological entries', 'Duration breakdown', 'Daily analytics'],
  },
  {
    key: 'timesheet',
    label: 'Timesheet',
    icon: <FileText size={16} />,
    title: 'Weekly Timesheet',
    desc: 'A structured weekly grid showing hours by project and day. Review totals, spot gaps, and prepare data for approvals or export.',
    highlights: ['Weekly grid view', 'Project × day matrix', 'Totals and subtotals', 'Export-ready format'],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: <BarChart2 size={16} />,
    title: 'Reports & Analytics',
    desc: 'Deep-dive into team or individual performance. Filter by date range, project, or member. Use data for billing, payroll, or capacity planning.',
    highlights: ['Date range filters', 'Team/project views', 'Performance metrics', 'Data export'],
  },
  {
    key: 'team',
    label: 'Team',
    icon: <Users size={16} />,
    title: 'Team Management',
    desc: 'Managers can see their team members, track who is active, manage project assignments, and review individual time summaries.',
    highlights: ['Member directory', 'Role management', 'Project assignments', 'Activity overview'],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: <ShieldCheck size={16} />,
    title: 'Admin & Organization',
    desc: 'Full organizational control. Manage users, configure projects and tasks, set approval workflows, and maintain audit visibility.',
    highlights: ['User management', 'Project configuration', 'Organization settings', 'Audit controls'],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: <Box size={16} />,
    title: 'Integrations',
    desc: 'Connect Google Calendar to auto-import events as time entries. Sync with Taiga for task-level tracking. More integrations coming soon.',
    highlights: ['Google Calendar sync', 'Taiga project sync', 'Automated imports', 'Connected workflows'],
  },
];

const roles = [
  {
    icon: <UserCheck size={24} />,
    title: 'Employees',
    desc: 'Track your work hours, manage tasks, submit timesheets, and stay on top of your daily productivity with an intuitive personal dashboard.',
  },
  {
    icon: <Briefcase size={24} />,
    title: 'Managers',
    desc: 'Oversee your team\'s time entries, review reports, approve timesheets, and gain visibility into project progress and resource allocation.',
  },
  {
    icon: <ShieldCheck size={24} />,
    title: 'Admins & Organizations',
    desc: 'Configure your organization, manage all users and projects, enforce policies, and access comprehensive audit and reporting tools.',
  },
];

const benefits = [
  { title: 'Better Work Visibility', desc: 'Know exactly where your team\'s hours go every single day.' },
  { title: 'Accurate Time Tracking', desc: 'Eliminate guesswork with real-time timers and structured entries.' },
  { title: 'Easier Billing Support', desc: 'Export time data organized by client and project for invoicing.' },
  { title: 'Project Accountability', desc: 'Track time against projects to keep budgets and deadlines honest.' },
  { title: 'Team Productivity Insights', desc: 'Identify patterns, bottlenecks, and top performers with reports.' },
  { title: 'Cleaner Approvals', desc: 'Structured timesheets make manager review fast and reliable.' },
  { title: 'Improved Resource Planning', desc: 'Use historical data to plan capacity and allocate work smarter.' },
  { title: 'Streamlined Reporting', desc: 'Generate payroll, client, or compliance reports in seconds.' },
];

const heroMetrics = [
  { label: 'Daily Entries Logged', value: '25K+' },
  { label: 'Teams Supported', value: '150+' },
  { label: 'Avg. Approval Time', value: '< 8 hrs' },
];

/* ───────────────────── video modal ───────────────────── */

const VideoModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="video-modal-close" onClick={onClose} aria-label="Close video">✕</button>
        <video
          ref={videoRef}
          className="video-modal-player"
          src="/demo.mp4"
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
};

/* ───────────────────── component ───────────────────── */

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [activeDemo, setActiveDemo] = useState('dashboard');
  const [showVideo, setShowVideo] = useState(false);
  const openVideo = useCallback(() => setShowVideo(true), []);
  const closeVideo = useCallback(() => setShowVideo(false), []);
  const currentDemo = demoTabs.find((t) => t.key === activeDemo) ?? demoTabs[0];

  const goLogin = () => navigate('/login');

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <a href="/landing" className="landing-nav-brand">
          <img src="/webforx-logo.png" alt="Web Forx" className="logo-mark-img" />
          <span>Web Forx Time Tracker</span>
        </a>
        <div className="landing-nav-actions">
          <button className="btn btn-outline" onClick={() => scrollTo('features')}>Features</button>
          <button className="btn btn-outline" onClick={() => scrollTo('demo')}>Demo</button>
          <button className="btn btn-primary" onClick={goLogin}>Sign In</button>
        </div>
      </nav>

      {/* ── 1. Hero ── */}
      <section className="landing-section hero">
        <p className="section-label">Time Tracking for Modern Teams</p>
        <h1 className="section-heading">
          Track Time. Improve Accountability. Deliver Results.
        </h1>
        <p className="section-subheading">
          A powerful, enterprise-ready time tracking platform built for agencies,
          engineering teams, and service organizations that need clarity on
          where every hour goes.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={goLogin}>
            Get Started <ArrowRight size={18} style={{ marginLeft: 6 }} />
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => scrollTo('demo')}>
            See How It Works
          </button>
        </div>
        <div className="hero-metrics">
          {heroMetrics.map((metric) => (
            <div className="hero-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
        <div className="hero-visual hero-video-thumb" onClick={openVideo} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openVideo()} aria-label="Watch product demo">
          <img src="/webforx-logo.png" alt="Web Forx" className="video-thumb-logo" />
          <div className="video-play-btn" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
          <div className="video-thumb-label">Watch the Demo &nbsp;·&nbsp; 76 seconds</div>
        </div>
      </section>

      {/* ── 2. Trust / Value Bar ── */}
      <div className="landing-section-alt">
        <div className="trust-bar">
          <div className="trust-item">
            <div className="trust-icon"><Clock size={20} /></div>
            <div className="trust-text">
              <strong>Accurate Time Capture</strong>
              <span>Real-time timers and manual entries ensure every minute is recorded.</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><Eye size={20} /></div>
            <div className="trust-text">
              <strong>Improved Accountability</strong>
              <span>Transparent tracking keeps teams aligned and managers informed.</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><BarChart2 size={20} /></div>
            <div className="trust-text">
              <strong>Project Visibility</strong>
              <span>See exactly where hours are spent across projects and tasks.</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon"><CheckCircle2 size={20} /></div>
            <div className="trust-text">
              <strong>Manager Reporting</strong>
              <span>Approval workflows and reports built for team leads.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Key Features ── */}
      <section className="landing-section section-center" id="features">
        <p className="section-label">Capabilities</p>
        <h2 className="section-heading">Everything You Need to Track, Report, and Manage</h2>
        <p className="section-subheading">
          From individual time entries to organization-wide analytics, every tool
          your team needs is built in.
        </p>
        <div className="features-grid">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.biz}</p>
              <p>{f.ops}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. How It Works ── */}
      <div className="landing-section-alt">
        <section className="landing-section section-center" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <p className="section-label">How It Works</p>
          <h2 className="section-heading">Up and Running in Six Simple Steps</h2>
          <p className="section-subheading">
            Whether you're an employee, manager, or admin — getting started takes minutes.
          </p>
          <div className="steps-grid">
            {steps.map((s) => (
              <div className="step-card" key={s.num}>
                <div className="step-number">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── 5. Interactive Demo / Walkthrough ── */}
      <section className="landing-section" id="demo">
        <div className="section-center">
          <p className="section-label">Product Walkthrough</p>
          <h2 className="section-heading">Explore the Product</h2>
          <p className="section-subheading">
            Click through each section to see what's inside.
          </p>
        </div>
        <div className="demo-section">
          <div className="demo-tabs">
            {demoTabs.map((tab) => (
              <button
                key={tab.key}
                className={`demo-tab ${activeDemo === tab.key ? 'active' : ''}`}
                onClick={() => setActiveDemo(tab.key)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="demo-panel">
            <div className="demo-panel-text">
              <h3>{currentDemo.title}</h3>
              <p>{currentDemo.desc}</p>
              <ul className="demo-highlight-list">
                {currentDemo.highlights.map((h) => (
                  <li key={h}>
                    <CheckCircle2 size={14} />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="demo-panel-visual">
              {currentDemo.highlights.map((h, i) => (
                <div className="demo-mock-row" key={h}>
                  <div className="demo-mock-dot" style={{ background: i % 2 === 0 ? 'var(--color-primary)' : 'var(--color-success)' }} />
                  <div className="demo-mock-bar" style={{ width: `${60 + i * 10}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. User Roles ── */}
      <div className="landing-section-alt">
        <section className="landing-section section-center" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <p className="section-label">Built For</p>
          <h2 className="section-heading">Designed for Every Role in Your Organization</h2>
          <p className="section-subheading">
            Whether you're tracking your own time, overseeing a team, or managing the organization — there's a tailored experience for you.
          </p>
          <div className="roles-grid">
            {roles.map((r) => (
              <div className="role-card" key={r.title}>
                <div className="role-card-icon">{r.icon}</div>
                <h3>{r.title}</h3>
                <p>{r.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── 7. Benefits ── */}
      <section className="landing-section">
        <div className="section-center">
          <p className="section-label">Why It Matters</p>
          <h2 className="section-heading">Real Outcomes for Real Teams</h2>
          <p className="section-subheading">
            Time tracking isn't just about logging hours — it's about making
            better decisions for your business.
          </p>
        </div>
        <div className="benefits-grid">
          {benefits.map((b) => (
            <div className="benefit-item" key={b.title}>
              <div className="benefit-check"><CheckCircle2 size={14} /></div>
              <div>
                <strong>{b.title}</strong>
                <span>{b.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 8. CTA Banner ── */}
      <section className="cta-banner">
        <h2 className="section-heading">Start Tracking Time Smarter</h2>
        <p className="section-subheading">
          Join organizations that rely on Web Forx Time Tracker
          to improve visibility, accountability, and productivity.
        </p>
        <div className="cta-actions">
          <button className="btn btn-lg btn-white" onClick={goLogin}>
            Sign In <ArrowRight size={18} style={{ marginLeft: 6 }} />
          </button>
          <button className="btn btn-lg btn-ghost" onClick={goLogin}>
            Request Access
          </button>
        </div>
      </section>

      {/* ── 9. Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-copy">
          &copy; {new Date().getFullYear()} Web Forx. All rights reserved.
        </div>
        <div className="landing-footer-links">
          <a href="/login">Sign In</a>
          <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo('features'); }}>Features</a>
          <a href="#demo" onClick={(e) => { e.preventDefault(); scrollTo('demo'); }}>Demo</a>
          <a href="#!" onClick={(e) => e.preventDefault()}>Privacy</a>
          <a href="#!" onClick={(e) => e.preventDefault()}>Terms</a>
        </div>
      </footer>
      <div className="landing-trademark">
        Powered by <strong>Maralito Labs</strong> for <strong>Webforx Technology</strong>
      </div>

      {showVideo && <VideoModal onClose={closeVideo} />}
    </div>
  );
};

export default Landing;
