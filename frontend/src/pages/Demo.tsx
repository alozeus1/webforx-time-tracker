import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, BarChart2, ShieldCheck } from 'lucide-react';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './Demo.css';

const DEMO_LOGIN_EMAIL = 'demo@webforxtech.com';

type DemoStop = {
  key: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  mockup: React.ReactNode;
};

const stops: DemoStop[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    title: 'Your Command Centre',
    desc: "Every morning starts here. See today's tracked hours, active timer status, top projects by time, and pending notifications — all without digging through reports.",
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Today</div>
              <div className="demo-stat-value">6h 42m</div>
              <div className="demo-stat-tag">84% of target</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Active timer</div>
              <div className="demo-stat-value" style={{ color: '#4ade80' }}>Running</div>
              <div className="demo-stat-tag">Platform Eng · 34m</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">This week</div>
              <div className="demo-stat-value">31h 10m</div>
              <div className="demo-stat-tag">3 projects</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Top projects today: Platform Engineering · Webforx Website · Business Analytics
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'timer',
    label: 'Timer',
    icon: <Clock size={16} />,
    title: 'One Click to Start Tracking',
    desc: 'Select a project, describe the task, and hit Start. The timer runs in the background — even if you switch tabs. It auto-saves your state every 15 seconds.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card" style={{ flex: 2 }}>
              <div className="demo-stat-label">Current session</div>
              <div className="demo-stat-value" style={{ fontSize: '2rem', color: '#4ade80' }}>00:34:12</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>● Live</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Task</div>
              <div style={{ fontSize: '0.85rem', color: '#f1f5f9', marginTop: '4px' }}>Sprint planning and backlog refinement</div>
              <div className="demo-stat-tag" style={{ marginTop: '6px' }}>Platform Engineering</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Break reminder in 26 minutes · Auto-save pulse active
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'workday',
    label: 'Workday / AI',
    icon: <LayoutDashboard size={16} />,
    title: 'AI-Assisted Workday Reconstruction',
    desc: 'Missed logging a meeting? The Workday view analyses your calendar events and activity signals to surface untracked time blocks. Review the suggestions and accept with one click.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { time: '09:00–09:45', label: 'Team standup', status: 'tracked', color: '#4ade80' },
              { time: '10:15–11:35', label: 'API architecture review', status: 'tracked', color: '#4ade80' },
              { time: '12:00–12:30', label: 'Lunch break', status: 'gap', color: '#64748b' },
              { time: '13:00–14:20', label: 'Calendar: Product review call', status: 'AI suggested', color: '#a78bfa' },
              { time: '14:30–16:00', label: 'Feature implementation', status: 'tracked', color: '#4ade80' },
            ].map((row) => (
              <div key={row.time} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.625rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', minWidth: '110px' }}>{row.time}</span>
                <span style={{ fontSize: '0.825rem', color: '#e2e8f0', flex: 1 }}>{row.label}</span>
                <span style={{ fontSize: '0.7rem', color: row.color, padding: '2px 8px', background: `${row.color}15`, borderRadius: '9999px' }}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: <Calendar size={16} />,
    title: 'Your Day in Chronological Order',
    desc: 'The Timeline shows every time entry as it happened. Navigate between days, edit entries within the allowed window, and spot unlogged gaps at a glance.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">First log</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>08:42 AM</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Last log</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>05:16 PM</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Total entries</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>8</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#f59e0b' }}>
            ⚠ Unlogged gap detected between 12:00 PM and 1:00 PM
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: <BarChart2 size={16} />,
    title: 'Analytics Built for Managers',
    desc: 'Filter by team member, project, or date range. View utilization, billable ratios, and approval lag. Export to CSV or PDF for payroll, billing, or client reports.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Team utilization</div>
              <div className="demo-stat-value">79%</div>
              <div className="demo-stat-tag">Mar 1–28</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Billable ratio</div>
              <div className="demo-stat-value">68%</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Approval lag</div>
              <div className="demo-stat-value">7h 14m</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>−18%</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Export: CSV · PDF · Scheduled delivery available
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: <ShieldCheck size={16} />,
    title: 'Full Organizational Control',
    desc: "Admins manage users, configure projects and tasks, define approval workflows, and review audit logs. Everything is role-gated — employees never see what isn't theirs.",
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Active projects</div>
              <div className="demo-stat-value">14</div>
              <div className="demo-stat-tag">+2 this month</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Team members</div>
              <div className="demo-stat-value">23</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Audit events (24h)</div>
              <div className="demo-stat-value">56</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>Normal</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Policy mode: Strict · Roles: Admin · Manager · Employee · Intern
          </div>
        </div>
      </div>
    ),
  },
];

const Demo: React.FC = () => {
  const [step, setStep] = useState(0);

  usePageMetadata({
    title: 'Product Tour | Web Forx Time Tracker',
    description: 'Explore the Web Forx Time Tracker product — Dashboard, Timer, AI Workday, Reports, and Admin views.',
    canonical: '/demo',
  });

  const current = stops[step];
  const isFirst = step === 0;
  const isLast = step === stops.length - 1;

  return (
    <div className="demo-tour-page">
      <div className="demo-tour-topbar">
        <Link to="/" className="demo-tour-brand">
          Web Forx Time Tracker
        </Link>
        <Link to="/" className="demo-tour-exit">← Back to site</Link>
      </div>

      <div className="demo-tour-body">
        <div className="demo-tour-sidebar">
          <div className="demo-tour-sidebar-title">Product Tour</div>
          {stops.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`demo-stop-btn ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
            >
              <span className="demo-stop-num">{i + 1}</span>
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        <div className="demo-tour-content">
          <p className="demo-stop-label">Step {step + 1} of {stops.length}</p>
          <h1 className="demo-stop-title">{current.title}</h1>
          <p className="demo-stop-desc">{current.desc}</p>
          {current.mockup}
          <div className="demo-cta-strip">
            <p>Want to explore the real app? Log in with the demo account — no sign-up needed.</p>
            <a href={`/login?prefill=${encodeURIComponent(DEMO_LOGIN_EMAIL)}`}>
              Try Demo Account →
            </a>
          </div>
        </div>
      </div>

      <div className="demo-tour-footer">
        <span className="demo-progress">{step + 1} / {stops.length}</span>
        <div className="demo-nav-btns">
          {!isFirst && (
            <button type="button" className="demo-nav-btn secondary" onClick={() => setStep((s) => s - 1)}>
              ← Previous
            </button>
          )}
          {!isLast ? (
            <button type="button" className="demo-nav-btn primary" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          ) : (
            <Link to="/request-access" className="demo-nav-btn primary" style={{ textDecoration: 'none' }}>
              Request Access →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Demo;
