import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { getStoredRole, getStoredToken } from './utils/session';

const Login = React.lazy(() => import('./pages/Login'));
const Landing = React.lazy(() => import('./pages/Landing'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const RequestAccess = React.lazy(() => import('./pages/RequestAccess'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Terms = React.lazy(() => import('./pages/Terms'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Workday = React.lazy(() => import('./pages/Workday'));
const Timer = React.lazy(() => import('./pages/Timer'));
const Timeline = React.lazy(() => import('./pages/Timeline'));
const Admin = React.lazy(() => import('./pages/Admin'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Team = React.lazy(() => import('./pages/Team'));
const Timesheet = React.lazy(() => import('./pages/Timesheet'));
const Integrations = React.lazy(() => import('./pages/Integrations'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Invoices = React.lazy(() => import('./pages/Invoices'));
const Templates = React.lazy(() => import('./pages/Templates'));
const Webhooks = React.lazy(() => import('./pages/Webhooks'));
const ScheduledReports = React.lazy(() => import('./pages/ScheduledReports'));
const SharedArtifact = React.lazy(() => import('./pages/SharedArtifact'));
const Demo = React.lazy(() => import('./pages/Demo'));
const Leave = React.lazy(() => import('./pages/Leave'));
const Schedule = React.lazy(() => import('./pages/Schedule'));
const Expenses = React.lazy(() => import('./pages/Expenses'));
const Geofencing = React.lazy(() => import('./pages/Geofencing'));
// Every routed page is wrapped in an error boundary as well as Suspense. Without the
// boundary, a render-time throw anywhere in a page unmounts the whole React tree and the
// user gets a blank white screen with no indication of what happened — which is exactly
// how the /schedule CSP failure presented. Scoping the boundary per page keeps the nav
// and shell usable when one section breaks.
const lazyPage = (page: React.ReactNode) => (
  <ErrorBoundary>
    <React.Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-500">Loading…</div>}>{page}</React.Suspense>
  </ErrorBoundary>
);

// Auth Guard
const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) => {
  const token = getStoredToken();
  const role = getStoredRole();

  if (!token) return <Navigate to="/login" replace />;
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const token = getStoredToken();
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const token = getStoredToken();
  if (token) return <Navigate to="/dashboard" replace />;
  return lazyPage(<Landing />);
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      {/* Outer net: catches throws in the application shell and route setup
          itself, so no route can produce a blank screen. Per-page boundaries inside
          lazyPage handle the lazy routes more granularly. */}
      <ErrorBoundary title="The application hit an unexpected error">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<PublicOnlyRoute>{lazyPage(<Login />)}</PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute>{lazyPage(<ForgotPassword />)}</PublicOnlyRoute>} />
        <Route path="/request-access" element={<PublicOnlyRoute>{lazyPage(<RequestAccess />)}</PublicOnlyRoute>} />
        <Route path="/privacy" element={lazyPage(<Privacy />)} />
        <Route path="/terms" element={lazyPage(<Terms />)} />
        <Route path="/share/:token" element={lazyPage(<SharedArtifact />)} />
        <Route path="/demo" element={lazyPage(<Demo />)} />

        {/* Protected app routes */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={lazyPage(<Dashboard />)} />
          <Route path="/workday" element={lazyPage(<Workday />)} />
          <Route path="/timer" element={lazyPage(<Timer />)} />
          <Route path="/timeline" element={lazyPage(<Timeline />)} />
          <Route path="/timesheet" element={lazyPage(<Timesheet />)} />
          <Route path="/reports" element={lazyPage(<Reports />)} />
          <Route path="/team" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}>{lazyPage(<Team />)}</ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['Admin']}>{lazyPage(<Admin />)}</ProtectedRoute>} />
          <Route path="/settings" element={lazyPage(<Settings />)} />
          <Route path="/profile" element={lazyPage(<Profile />)} />
          <Route path="/invoices" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}>{lazyPage(<Invoices />)}</ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}>{lazyPage(<Templates />)}</ProtectedRoute>} />
          <Route path="/webhooks" element={<ProtectedRoute allowedRoles={['Admin']}>{lazyPage(<Webhooks />)}</ProtectedRoute>} />
          <Route path="/scheduled-reports" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}>{lazyPage(<ScheduledReports />)}</ProtectedRoute>} />
          <Route path="/integrations" element={lazyPage(<Integrations />)} />
          <Route path="/integrations/taiga" element={lazyPage(<Integrations />)} />
          <Route path="/integrations/mattermost" element={lazyPage(<Integrations />)} />
          <Route path="/leave" element={lazyPage(<Leave />)} />
          <Route path="/schedule" element={lazyPage(<Schedule />)} />
          <Route path="/expenses" element={lazyPage(<Expenses />)} />
          <Route path="/geofencing" element={<ProtectedRoute allowedRoles={['Admin']}>{lazyPage(<Geofencing />)}</ProtectedRoute>} />
        </Route>
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
