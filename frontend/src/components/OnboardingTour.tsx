import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Clock, Calendar, FileText, BarChart2,
  Users, ShieldCheck, Box, Rocket, ArrowRight, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import './OnboardingTour.css';

const ONBOARDING_KEY = 'onboarding_completed';

interface TourStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlights: string[];
  navigateTo?: string;
}

const tourSteps: TourStep[] = [
  {
    icon: <Rocket size={28} />,
    title: 'Welcome to Web Forx Time Tracker',
    description:
      'Your team\'s command center for time tracking, reporting, and project visibility. ' +
      'This quick tour will show you the key areas of the application so you can hit the ground running.',
    highlights: [
      'Track time with live timers or manual entries',
      'View dashboards, timelines, and weekly timesheets',
      'Generate reports for billing, payroll, or planning',
      'Manage your team, projects, and integrations',
    ],
  },
  {
    icon: <LayoutDashboard size={28} />,
    title: 'Dashboard',
    description:
      'The dashboard is your daily overview. It shows your tracked hours, active timers, recent entries, and project breakdowns at a glance.',
    highlights: [
      'Summary cards: today\'s hours, weekly total, active timer',
      'Recent time entries with project and duration',
      'Top projects by time spent',
      'Manager/admin notifications for approvals',
    ],
    navigateTo: '/dashboard',
  },
  {
    icon: <Clock size={28} />,
    title: 'Timer',
    description:
      'The timer page is where you start and stop tracking. Add a task description, select a project, and click start — your time is captured live.',
    highlights: [
      'Task description field for context',
      'Project selector to categorize work',
      'One-click start / stop controls',
      'Daily progress bar showing hours against goal',
    ],
    navigateTo: '/timer',
  },
  {
    icon: <Calendar size={28} />,
    title: 'Timeline',
    description:
      'Timeline gives you a chronological view of your day. Navigate between dates, review entries, and check daily analytics.',
    highlights: [
      'Date navigation with calendar picker',
      'Entry list in time order',
      'Duration and project breakdown per entry',
      'Daily total and analytics',
    ],
    navigateTo: '/timeline',
  },
  {
    icon: <FileText size={28} />,
    title: 'Weekly Timesheet',
    description:
      'The timesheet aggregates your hours into a weekly grid organized by project and day. It\'s designed for quick review, approval submissions, and export.',
    highlights: [
      'Week-level aggregation by project',
      'Day-by-day column breakdown',
      'Daily and project totals',
      'Ready for approval workflows and export',
    ],
    navigateTo: '/timesheet',
  },
  {
    icon: <BarChart2 size={28} />,
    title: 'Reports & Analytics',
    description:
      'Reports let you filter and analyze time data across your team. Use them for billing summaries, payroll, performance reviews, or resource planning.',
    highlights: [
      'Filter by date range, project, or team member',
      'Team and individual performance metrics',
      'Approval status tracking',
      'Export for payroll or client billing',
    ],
    navigateTo: '/reports',
  },
  {
    icon: <Users size={28} />,
    title: 'Team & Admin',
    description:
      'Managers can view and manage team members, while admins have full control over organization settings, projects, tasks, and user roles.',
    highlights: [
      'Team member directory and activity',
      'Role-based visibility (Manager, Admin)',
      'Project and task configuration',
      'Organization-wide controls and audit',
    ],
    navigateTo: '/team',
  },
  {
    icon: <Box size={28} />,
    title: 'Integrations',
    description:
      'Connect your existing tools to streamline workflows. Sync Google Calendar events as time entries or pull tasks from Taiga for project-level tracking.',
    highlights: [
      'Google Calendar: import events as entries',
      'Taiga: sync tasks and projects',
      'Automated time capture from connected tools',
      'More integrations coming soon',
    ],
    navigateTo: '/integrations',
  },
  {
    icon: <ShieldCheck size={28} />,
    title: 'You\'re All Set!',
    description:
      'You\'ve completed the product tour. Start by creating your first time entry — head to the Timer page and track your first task.',
    highlights: [
      'Go to the Timer to start tracking',
      'Check the Dashboard anytime for an overview',
      'Use the Timesheet at the end of each week',
      'Restart this tour from the sidebar anytime',
    ],
    navigateTo: '/timer',
  },
];

interface OnboardingTourProps {
  onClose?: () => void;
}

const shouldShowOnboarding = () =>
  typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_KEY);

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(shouldShowOnboarding);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setVisible(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const close = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setVisible(false);
    onClose?.();
  };

  const goNext = () => {
    if (step < tourSteps.length - 1) {
      setStep((s) => s + 1);
    } else {
      close();
      navigate('/timer');
    }
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  if (!visible) return null;

  const current = tourSteps[step];
  const isLast = step === tourSteps.length - 1;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="tour-modal">
        <div className="tour-header">
          <span className="tour-step-badge">
            {step + 1} of {tourSteps.length}
          </span>
          <button className="tour-skip" onClick={close}>
            Skip tour
          </button>
        </div>

        <div className="tour-body">
          <div className="tour-icon-row">
            <div className="tour-icon-circle">{current.icon}</div>
          </div>
          <h2>{current.title}</h2>
          <p>{current.description}</p>
          <ul className="tour-highlights">
            {current.highlights.map((h) => (
              <li key={h}>
                <CheckCircle2 size={14} />
                {h}
              </li>
            ))}
          </ul>
        </div>

        <div className="tour-footer">
          <div className="tour-dots">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={`tour-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              />
            ))}
          </div>
          <div className="tour-nav">
            {step > 0 && (
              <button className="tour-btn tour-btn-back" onClick={goBack}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button className="tour-btn tour-btn-next" onClick={goNext}>
              {isLast ? 'Go to Timer' : 'Next'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { ONBOARDING_KEY };
export default OnboardingTour;
