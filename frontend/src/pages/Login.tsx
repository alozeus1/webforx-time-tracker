import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, Timer, ChartColumnBig } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import './Login.css';
import { setStoredSession } from '../utils/session';
import { consumeAuthFailureMessage, resetAuthFailureState } from '../utils/authFailure';
import { usePageMetadata } from '../hooks/usePageMetadata';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    usePageMetadata({
        title: 'Sign In | Web Forx Time Tracker',
        description: 'Sign in to Web Forx Time Tracker to manage timers, timesheets, approvals, and team reporting.',
        ogTitle: 'Sign In - Web Forx Time Tracker',
        ogDescription: 'Secure workspace login for Web Forx Time Tracker users.',
        canonical: '/login',
        noIndex: true,
    });

    useEffect(() => {
        const storedMessage = consumeAuthFailureMessage();
        if (storedMessage) {
            setErrorMessage(storedMessage);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);

        try {
            const response = await api.post('/auth/login', { email, password });
            setStoredSession(response.data.token, response.data.user.role, response.data.user);
            if (response.data.refreshToken) {
                localStorage.setItem('refreshToken', response.data.refreshToken);
            }
            resetAuthFailureState();
            navigate('/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
            setErrorMessage(getApiErrorMessage(error, 'Login failed. Please check your credentials and try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main id="main-content" className="login-container" tabIndex={-1}>
            <div className="login-side-panel">
                <div className="login-side-brand">
                    <img src="/webforx-logo.png" alt="Web Forx" className="logo-icon-large logo-icon-large-image" />
                    <div>
                        <h2>Web Forx Time Tracker</h2>
                        <p>Operational clarity for high-performing teams</p>
                    </div>
                </div>

                <div className="login-side-highlights">
                    <div className="side-highlight">
                        <Timer size={18} />
                        <div>
                            <strong>Live time capture</strong>
                            <span>Track every minute by project and task.</span>
                        </div>
                    </div>
                    <div className="side-highlight">
                        <ChartColumnBig size={18} />
                        <div>
                            <strong>Actionable reporting</strong>
                            <span>Monitor workload, approvals, and team output.</span>
                        </div>
                    </div>
                    <div className="side-highlight">
                        <ShieldCheck size={18} />
                        <div>
                            <strong>Enterprise controls</strong>
                            <span>Role-based access with secure session handling.</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="login-card">
                <div className="login-header">
                    <p className="login-kicker">Welcome Back</p>
                    <h1>Sign In to Continue</h1>
                    <p>Use your organization account to access the workspace.</p>
                </div>

                {errorMessage && (
                    <div className="login-error">
                        {errorMessage}
                    </div>
                )}

                <form method="post" onSubmit={handleLogin} className="login-form">
                    <div className="form-group icon-input">
                        <label className="form-label" htmlFor="email">Work Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" size={18} />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                className="form-control"
                                placeholder="name@webforx.com"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group icon-input">
                        <label className="form-label" htmlFor="password">Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" size={18} />
                            <input
                                id="password"
                                name="password"
                                type="password"
                                className="form-control"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>

                <div className="login-footer">
                    <Link to="/forgot-password">Forgot your password?</Link>
                    <Link to="/request-access">Need access? Request access</Link>
                    <div className="login-footer-legal">
                        <Link to="/privacy">Privacy</Link>
                        <Link to="/terms">Terms</Link>
                    </div>
                    <Link to="/">Back to product overview</Link>
                </div>
            </div>
        </main>
    );
};

export default Login;
