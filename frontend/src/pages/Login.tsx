import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, Timer, ChartColumnBig } from 'lucide-react';
import api from '../services/api';
import './Login.css';
import { setStoredSession } from '../utils/session';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const navigate = useNavigate();

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
            navigate('/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
            setErrorMessage('Login failed. Please check your credentials and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
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

                <form onSubmit={handleLogin} className="login-form">
                    <div className="form-group icon-input">
                        <label className="form-label" htmlFor="email">Work Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" size={18} />
                            <input
                                id="email"
                                type="email"
                                className="form-control"
                                placeholder="name@webforx.com"
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
                                type="password"
                                className="form-control"
                                placeholder="••••••••"
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
                    <p>Need access? Contact your organization admin.</p>
                    <Link to="/landing">Back to product overview</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
