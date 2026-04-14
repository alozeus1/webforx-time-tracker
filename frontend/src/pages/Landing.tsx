import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Clock, Calendar, FileText, BarChart2, Users,
  ShieldCheck, Plug, CheckCircle2, ArrowRight,
  Eye, Briefcase, UserCheck, LockKeyhole,
  Brain, AlertTriangle, Zap, TrendingUp,
} from 'lucide-react';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './Landing.css';

/* ───────────────────── static data ───────────────────── */

type DemoTone = 'primary' | 'success' | 'info' | 'warning';

type DemoTab = {
  key: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  highlights: string[];
  preview: {
    headline: string;
    subline: string;
    badges: string[];
    rows: Array<{
      label: string;
      value: string;
      tone: DemoTone;
      trend: string;
    }>;
    footer: string;
  };
};

const DEMO_VIDEO_SOURCE = '/webforx-demo-pull.mp4';

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
    icon: <Plug size={20} />,
    title: 'Integrations',
    biz: 'Connect your existing tools for a seamless workflow.',
    ops: 'Sync with Google Calendar, Taiga, and more.',
  },
  {
    icon: <LockKeyhole size={20} />,
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

const demoTabs: DemoTab[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    title: 'Dashboard',
    desc: 'Your command center. See today\'s tracked hours, active timer status, recent entries, top projects by time spent, and pending notifications — all in one view.',
    highlights: ['Daily hours summary', 'Active timer status', 'Project breakdown', 'Manager notifications'],
    preview: {
      headline: 'Today Snapshot',
      subline: 'Tue, Mar 28 · 6h 42m tracked',
      badges: ['3 active projects', '2 approvals pending'],
      rows: [
        { label: 'Platform Engineering', value: '2h 10m', tone: 'primary', trend: '+12%' },
        { label: 'Webforx Website', value: '1h 45m', tone: 'info', trend: '+4%' },
        { label: 'Business Analysis', value: '1h 22m', tone: 'success', trend: 'On target' },
      ],
      footer: 'Utilization: 84% of target hours',
    },
  },
  {
    key: 'timer',
    label: 'Timer',
    icon: <Clock size={16} />,
    title: 'Timer',
    desc: 'Start tracking with a single click. Assign a task description, select a project, and let the live timer capture your work as it happens.',
    highlights: ['One-click start/stop', 'Task description', 'Project assignment', 'Daily progress bar'],
    preview: {
      headline: 'Live Session',
      subline: 'Task: Sprint planning and backlog refinement',
      badges: ['Running · 00:34:12', 'Project: Platform Engineering'],
      rows: [
        { label: 'Current run time', value: '00:34:12', tone: 'success', trend: 'Live' },
        { label: 'Today total', value: '5h 18m', tone: 'primary', trend: '82%' },
        { label: 'Break reminder', value: 'In 26m', tone: 'warning', trend: 'Health check' },
      ],
      footer: 'Auto-save pulse every 15 seconds',
    },
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: <Calendar size={16} />,
    title: 'Timeline',
    desc: 'Review your day in chronological order. Navigate between dates, see entry details, and understand how your hours are distributed.',
    highlights: ['Date navigation', 'Chronological entries', 'Duration breakdown', 'Daily analytics'],
    preview: {
      headline: 'Daily Timeline',
      subline: '8 entries sorted by start time',
      badges: ['First log: 08:42', 'Last log: 17:16'],
      rows: [
        { label: '09:00 · QA sync', value: '42m', tone: 'info', trend: 'Closed' },
        { label: '10:15 · API review', value: '1h 20m', tone: 'primary', trend: 'Tracked' },
        { label: '14:10 · Standup prep', value: '35m', tone: 'success', trend: 'Tracked' },
      ],
      footer: 'Unlogged gap detected: 17 minutes',
    },
  },
  {
    key: 'timesheet',
    label: 'Timesheet',
    icon: <FileText size={16} />,
    title: 'Weekly Timesheet',
    desc: 'A structured weekly grid showing hours by project and day. Review totals, spot gaps, and prepare data for approvals or export.',
    highlights: ['Weekly grid view', 'Project × day matrix', 'Totals and subtotals', 'Export-ready format'],
    preview: {
      headline: 'Week 13 Summary',
      subline: 'Total tracked: 37h 55m',
      badges: ['4 projects', '1 pending approval'],
      rows: [
        { label: 'Platform Engineering', value: '14h 40m', tone: 'primary', trend: '38%' },
        { label: 'EDUSUC', value: '8h 55m', tone: 'success', trend: '23%' },
        { label: 'Web Forx Technology', value: '7h 10m', tone: 'info', trend: '19%' },
      ],
      footer: 'Submission deadline: Friday, 6:00 PM',
    },
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: <BarChart2 size={16} />,
    title: 'Reports & Analytics',
    desc: 'Deep-dive into team or individual performance. Filter by date range, project, or member. Use data for billing, payroll, or capacity planning.',
    highlights: ['Date range filters', 'Team/project views', 'Performance metrics', 'Data export'],
    preview: {
      headline: 'Team Analytics',
      subline: 'Range: Mar 1 - Mar 28',
      badges: ['Team utilization: 79%', 'Billable ratio: 68%'],
      rows: [
        { label: 'Most tracked project', value: 'Platform Engineering', tone: 'primary', trend: '+9%' },
        { label: 'Average approval lag', value: '7h 14m', tone: 'success', trend: '-18%' },
        { label: 'At-risk capacity', value: '2 members', tone: 'warning', trend: 'Needs action' },
      ],
      footer: 'Exports available: CSV and PDF',
    },
  },
  {
    key: 'team',
    label: 'Team',
    icon: <Users size={16} />,
    title: 'Team Management',
    desc: 'Managers can see their team members, track who is active, manage project assignments, and review individual time summaries.',
    highlights: ['Member directory', 'Role management', 'Project assignments', 'Activity overview'],
    preview: {
      headline: 'Team Status',
      subline: '12 members in Engineering pod',
      badges: ['9 online now', '2 pending approvals'],
      rows: [
        { label: 'Active timers', value: '7 members', tone: 'success', trend: 'Live' },
        { label: 'Unsubmitted timesheets', value: '3 members', tone: 'warning', trend: 'Follow up' },
        { label: 'Top contributor today', value: 'I. Kalu · 7h 04m', tone: 'info', trend: '+11%' },
      ],
      footer: 'Manager digest updated 5 minutes ago',
    },
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: <ShieldCheck size={16} />,
    title: 'Admin & Organization',
    desc: 'Full organizational control. Manage users, configure projects and tasks, set approval workflows, and maintain audit visibility.',
    highlights: ['User management', 'Project configuration', 'Organization settings', 'Audit controls'],
    preview: {
      headline: 'Organization Controls',
      subline: 'Workspace: Web Forx Technology',
      badges: ['Roles synced', 'Policy mode: strict'],
      rows: [
        { label: 'Pending role changes', value: '2 requests', tone: 'warning', trend: 'Review' },
        { label: 'Active projects', value: '14', tone: 'primary', trend: '+2 this month' },
        { label: 'Audit events (24h)', value: '56 entries', tone: 'info', trend: 'Normal' },
      ],
      footer: 'Last policy update: Today, 10:18 AM',
    },
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: <Plug size={16} />,
    title: 'Integrations',
    desc: 'Connect Google Calendar to auto-import events as time entries. Sync with Taiga for task-level tracking. More integrations coming soon.',
    highlights: ['Google Calendar sync', 'Taiga project sync', 'Automated imports', 'Connected workflows'],
    preview: {
      headline: 'Connected Services',
      subline: '2 integrations active',
      badges: ['Google Calendar connected', 'Taiga linked'],
      rows: [
        { label: 'Last calendar sync', value: '4 minutes ago', tone: 'success', trend: 'Healthy' },
        { label: 'Imported events today', value: '11 entries', tone: 'primary', trend: '+3' },
        { label: 'Failed webhook calls', value: '0', tone: 'info', trend: 'Stable' },
      ],
      footer: 'Next sync window: 11:45 AM',
    },
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

const aiFeatures = [
  {
    icon: <Brain size={20} />,
    title: 'Workday Reconstruction',
    desc: 'When gaps appear in the daily log, the system analyses calendar events and activity signals to suggest missing time blocks — reducing context loss at end of day.',
  },
  {
    icon: <AlertTriangle size={20} />,
    title: 'Burnout Risk Detection',
    desc: 'Weekly hours are monitored per team member. Alerts surface when anyone approaches healthy workload thresholds — before damage is done.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Approval Intelligence',
    desc: 'Timesheet entries are scored for anomalies — unusual durations, project mismatches, submission timing — so managers prioritise review on what matters.',
  },
  {
    icon: <TrendingUp size={20} />,
    title: '14-Day Capacity Forecast',
    desc: "Using the last 7 days of tracked data, the platform projects each team member's load and overload risk over the next two weeks — enabling proactive planning.",
  },
];

const heroMetrics = [
  { label: 'Daily Entries Logged', value: '25K+' },
  { label: 'Teams Supported', value: '150+' },
  { label: 'Avg. Approval Time', value: '< 8 hrs' },
];

type GalleryTab = 'all' | 'employee' | 'manager' | 'admin';

const galleryImages: Array<{ src: string; caption: string; role: GalleryTab }> = [
  { src: '/screenshots/dashboard.png', caption: 'Dashboard — daily totals and active timer', role: 'employee' },
  { src: '/screenshots/workday.png', caption: 'Workday — AI-assisted activity reconstruction', role: 'employee' },
  { src: '/screenshots/timeline.png', caption: 'Timeline — chronological daily log', role: 'employee' },
  { src: '/screenshots/reports.png', caption: 'Reports — team analytics and utilization', role: 'manager' },
  { src: '/screenshots/team.png', caption: 'Team — member directory and activity overview', role: 'manager' },
  { src: '/screenshots/admin.png', caption: 'Admin — organization controls and audit visibility', role: 'admin' },
];

/* ───────────────────── video modal ───────────────────── */

const VideoModal: React.FC<{ onClose: () => void; source: string }> = ({ onClose, source }) => {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const retryVideo = () => {
    setHasVideoError(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="video-modal-container"
        role="dialog"
        aria-modal="true"
        aria-label="Demo video"
        aria-labelledby="demo-video-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="demo-video-modal-title" className="visually-hidden">Web Forx Time Tracker demo video</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="video-modal-close"
          onClick={onClose}
          aria-label="Close demo video"
        >
          ✕
        </button>

        {hasVideoError ? (
          <div className="video-modal-fallback" role="status" aria-live="polite">
            <h3>Demo video is temporarily unavailable</h3>
            <p>
              We could not load the video stream. Please retry, or download the advert directly.
            </p>
            <div className="video-modal-fallback-actions">
              <button type="button" className="btn btn-primary" onClick={retryVideo}>Retry video</button>
              <a className="btn btn-outline" href={source} target="_blank" rel="noopener noreferrer">Open video file</a>
            </div>
          </div>
        ) : (
          <video
            key={reloadKey}
            ref={videoRef}
            className="video-modal-player"
            src={source}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onError={() => setHasVideoError(true)}
          />
        )}
      </div>
    </div>
  );
};

/* ───────────────────── component ───────────────────── */

const Landing: React.FC = () => {
  const [activeDemo, setActiveDemo] = useState('dashboard');
  const [showVideo, setShowVideo] = useState(false);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentDemo = demoTabs.find((t) => t.key === activeDemo) ?? demoTabs[0];

  usePageMetadata({
    title: 'Web Forx Time Tracker | Track Time, Teams, and Approvals',
    description: 'Web Forx Time Tracker helps teams capture hours, submit timesheets, and monitor project productivity with secure role-based access.',
    ogTitle: 'Web Forx Time Tracker',
    ogDescription: 'Track team hours, approvals, and project delivery with one enterprise-ready time tracking platform.',
    ogImage: '/webforx-logo.png',
    canonical: '/',
  });

  const openVideo = useCallback(() => setShowVideo(true), []);
  const closeVideo = useCallback(() => setShowVideo(false), []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const filtered = galleryImages.filter((img) => galleryTab === 'all' || img.role === galleryTab);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length));
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length));
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, galleryTab]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDemoTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % demoTabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + demoTabs.length) % demoTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = demoTabs.length - 1;

    if (nextIndex !== index) {
      event.preventDefault();
      setActiveDemo(demoTabs[nextIndex].key);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="landing-page">
      {/* ── Nav ── */}
      <nav className="landing-nav" aria-label="Main navigation">
        <Link to="/" className="landing-nav-brand">
          <img src="/webforx-logo.png" alt="Web Forx" className="logo-mark-img" />
          <span>Web Forx Time Tracker</span>
        </Link>
        <div className="landing-nav-actions">
          <button type="button" className="btn btn-outline" onClick={() => scrollTo('features')}>Features</button>
          <button type="button" className="btn btn-outline" onClick={() => scrollTo('ai-features')}>AI</button>
          <button type="button" className="btn btn-outline" onClick={() => scrollTo('demo')}>Demo</button>
          <Link to="/login" className="btn btn-primary">Sign In</Link>
        </div>
      </nav>

      <main id="main-content" tabIndex={-1}>
        {/* ── 1. Hero ── */}
        <section className="landing-section hero">
          {/* Floating orbs */}
          <div className="hero-orb-1" aria-hidden="true" />
          <div className="hero-orb-2" aria-hidden="true" />
          <div className="hero-orb-3" aria-hidden="true" />

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
            <Link className="btn btn-primary btn-lg" to="/login">
              Get Started <ArrowRight size={18} style={{ marginLeft: 6 }} />
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/demo">
              Try Demo
            </Link>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => scrollTo('how-it-works')}>
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
          <button
            type="button"
            className="hero-visual hero-video-thumb"
            onClick={openVideo}
            aria-label="Watch demo video"
          >
            <img src="/webforx-logo.png" alt="Web Forx" className="video-thumb-logo" />
            <div className="video-play-btn" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
            <div className="video-thumb-label">Watch the Demo · 76 seconds</div>
          </button>
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
          <section className="landing-section section-center" id="how-it-works" style={{ paddingTop: 0, paddingBottom: 0 }}>
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
            <div className="demo-tabs" role="tablist" aria-label="Product walkthrough tabs">
              {demoTabs.map((tab, index) => (
                <button
                  type="button"
                  key={tab.key}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  className={`demo-tab ${activeDemo === tab.key ? 'active' : ''}`}
                  role="tab"
                  id={`demo-tab-${tab.key}`}
                  aria-selected={activeDemo === tab.key}
                  aria-controls={`demo-panel-${tab.key}`}
                  tabIndex={activeDemo === tab.key ? 0 : -1}
                  onClick={() => setActiveDemo(tab.key)}
                  onKeyDown={(event) => handleDemoTabKeyDown(event, index)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="demo-panel" role="tabpanel" id={`demo-panel-${currentDemo.key}`} aria-labelledby={`demo-tab-${currentDemo.key}`}>
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
              <div className="demo-panel-visual" aria-label={`${currentDemo.title} preview`}>
                <div className="demo-preview-header">
                  <strong>{currentDemo.preview.headline}</strong>
                  <span>{currentDemo.preview.subline}</span>
                </div>
                <div className="demo-preview-badges">
                  {currentDemo.preview.badges.map((badge) => (
                    <span key={badge}>{badge}</span>
                  ))}
                </div>
                <div className="demo-preview-rows">
                  {currentDemo.preview.rows.map((row) => (
                    <div className={`demo-preview-row demo-tone-${row.tone}`} key={row.label}>
                      <div className="demo-preview-row-main">
                        <strong>{row.label}</strong>
                        <span>{row.value}</span>
                      </div>
                      <em>{row.trend}</em>
                    </div>
                  ))}
                </div>
                <p className="demo-preview-footer">{currentDemo.preview.footer}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5b. AI Features ── */}
        <section className="landing-section section-center" id="ai-features">
          <p className="section-label">AI-Powered Operations</p>
          <h2 className="section-heading">Intelligence Built Into Every Workflow</h2>
          <p className="section-subheading">
            Every insight is derived from real tracked time — not estimates or guesses.
          </p>
          <div className="ai-features-grid">
            {aiFeatures.map((f) => (
              <div className="ai-feature-card" key={f.title}>
                <div className="ai-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="ai-trust-line">
            Built on real signals, not predictions. Every AI insight is derived from your team's actual tracked time data.
          </p>
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

        {/* ── 7b. Screenshot Gallery ── */}
        <section className="landing-section section-center" id="gallery">
          <p className="section-label">In Action</p>
          <h2 className="section-heading">See the Platform</h2>
          <p className="section-subheading">Real views from the product — captured from a live workspace.</p>

          <div className="gallery-tabs" role="tablist" aria-label="Screenshot gallery tabs">
            {(['all', 'employee', 'manager', 'admin'] as GalleryTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={galleryTab === tab}
                className={`gallery-tab ${galleryTab === tab ? 'active' : ''}`}
                onClick={() => setGalleryTab(tab)}
              >
                {tab === 'all' ? 'All Views' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="gallery-grid">
            {galleryImages
              .filter((img) => galleryTab === 'all' || img.role === galleryTab)
              .map((img, idx) => (
                <button
                  key={img.src}
                  type="button"
                  className="gallery-thumb"
                  onClick={() => setLightboxIndex(idx)}
                  aria-label={`View screenshot: ${img.caption}`}
                >
                  <img src={img.src} alt={img.caption} loading="lazy" />
                  <div className="gallery-thumb-caption">{img.caption}</div>
                </button>
              ))}
          </div>
        </section>

        {lightboxIndex !== null && (() => {
          const filtered = galleryImages.filter((img) => galleryTab === 'all' || img.role === galleryTab);
          const current = filtered[lightboxIndex];
          if (!current) return null;
          return (
            <div
              className="lightbox-backdrop"
              onClick={() => setLightboxIndex(null)}
              role="dialog"
              aria-modal="true"
              aria-label={current.caption}
            >
              <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="lightbox-close" onClick={() => setLightboxIndex(null)} aria-label="Close">✕</button>
                <img src={current.src} alt={current.caption} className="lightbox-image" />
                <p className="lightbox-caption">{current.caption}</p>
                <div className="lightbox-nav">
                  <button type="button" onClick={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length))} aria-label="Previous">←</button>
                  <span>{lightboxIndex + 1} / {filtered.length}</span>
                  <button type="button" onClick={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length))} aria-label="Next">→</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 8. CTA Banner ── */}
        <section className="cta-banner">
          <h2 className="section-heading">Start Tracking Time Smarter</h2>
          <p className="section-subheading">
            Join organizations that rely on Web Forx Time Tracker
            to improve visibility, accountability, and productivity.
          </p>
          <div className="cta-actions">
            <Link className="btn btn-lg btn-white" to="/login">
              Sign In <ArrowRight size={18} style={{ marginLeft: 6 }} />
            </Link>
            <Link className="btn btn-lg btn-ghost" to="/request-access">
              Request Access
            </Link>
            <Link className="btn btn-lg btn-ghost" to="/demo">
              Try Demo
            </Link>
          </div>
        </section>

        {/* ── 9. Footer ── */}
        <footer className="landing-footer">
          <div className="landing-footer-copy">
            &copy; {new Date().getFullYear()} Web Forx. All rights reserved.
          </div>
          <div className="landing-footer-links">
            <Link to="/login">Sign In</Link>
            <Link to="/request-access">Request Access</Link>
            <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo('features'); }}>Features</a>
            <a href="#demo" onClick={(e) => { e.preventDefault(); scrollTo('demo'); }}>Demo</a>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </footer>
        <div className="landing-trademark">
          Powered by <strong>Maralito Labs</strong> for <strong>Webforx Technology</strong>
        </div>
      </main>

      {showVideo && <VideoModal onClose={closeVideo} source={DEMO_VIDEO_SOURCE} />}
    </div>
  );
};

export default Landing;
