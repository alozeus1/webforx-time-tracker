import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import ForgotPassword from './pages/ForgotPassword';
import RequestAccess from './pages/RequestAccess';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Dashboard from './pages/Dashboard';
import Workday from './pages/Workday';
import Timer from './pages/Timer';
import Timeline from './pages/Timeline';
import Admin from './pages/Admin';
import Reports from './pages/Reports';
import Team from './pages/Team';
import Timesheet from './pages/Timesheet';
import Integrations from './pages/Integrations';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Invoices from './pages/Invoices';
import Templates from './pages/Templates';
import Webhooks from './pages/Webhooks';
import ScheduledReports from './pages/ScheduledReports';
import SharedArtifact from './pages/SharedArtifact';
import Demo from './pages/Demo';
import { getStoredRole, getStoredToken } from './utils/session';

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
  return <Landing />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
        <Route path="/request-access" element={<PublicOnlyRoute><RequestAccess /></PublicOnlyRoute>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/share/:token" element={<SharedArtifact />} />
        <Route path="/demo" element={<Demo />} />

        {/* Protected app routes */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workday" element={<Workday />} />
          <Route path="/timer" element={<Timer />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/timesheet" element={<Timesheet />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/team" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}><Team /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['Admin', 'Manager']}><Admin /></ProtectedRoute>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/invoices" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}><Invoices /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}><Templates /></ProtectedRoute>} />
          <Route path="/webhooks" element={<ProtectedRoute allowedRoles={['Admin']}><Webhooks /></ProtectedRoute>} />
          <Route path="/scheduled-reports" element={<ProtectedRoute allowedRoles={['Manager', 'Admin']}><ScheduledReports /></ProtectedRoute>} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/taiga" element={<Integrations />} />
          <Route path="/integrations/mattermost" element={<Integrations />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
