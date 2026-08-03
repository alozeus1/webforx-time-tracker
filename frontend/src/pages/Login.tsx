import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, Timer, ChartColumnBig } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import './Login.css';
import { setStoredSession } from '../utils/session';
import { consumeAuthFailureMessage, resetAuthFailureState } from '../utils/authFailure';
import { usePageMetadata } from '../hooks/usePageMetadata';

// Minimal ambient type for Google Identity Services
declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize(cfg: { client_id: string; callback: (resp: { credential: string }) => void; auto_select?: boolean }): void;
                    renderButton(el: HTMLElement, opts: { theme?: string; size?: string; width?: number; text?: string }): void;
                };
            };
        };
    }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // MFA second-step state
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaChallengeToken, setMfaChallengeToken] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const googleButtonRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    usePageMetadata({
        title: 'Web Forx Time Tracker | Secure Team Time Tracking',
        description: 'Web Forx Time Tracker helps teams track work hours, submit timesheets, manage approvals, and monitor project delivery in one secure workspace.',
        ogTitle: 'Web Forx Time Tracker | Secure Team Time Tracking',
        ogDescription: 'Web Forx Time Tracker helps teams track work hours, submit timesheets, manage approvals, and monitor project delivery in one secure workspace.',
        ogImage: '/webforx-logo.png',
        twitterCard: 'summary',
        canonical: '/login',
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
            // withCredentials is required here specifically because this response sets the
            // httpOnly access/refresh cookies used later by the silent-refresh flow.
            const response = await api.post('/auth/login', { email, password }, { withCredentials: true });
            if (response.data.mfa_required) {
                // Step 1 done — show TOTP input
                setMfaChallengeToken(response.data.mfa_challenge_token as string);
                setMfaRequired(true);
                return;
            }
            setStoredSession(response.data.token, response.data.user.role, response.data.user, response.data.csrfToken);
            resetAuthFailureState();
            navigate('/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
            setErrorMessage(getApiErrorMessage(error, 'Login failed. Please check your credentials and try again.'));
        } finally {
            setLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        try {
            // withCredentials is required here for the same reason as /auth/login above —
            // this response also sets the httpOnly access/refresh cookies.
            const response = await api.post('/auth/mfa/validate', {
                mfa_challenge_token: mfaChallengeToken,
                totp_code: totpCode,
            }, { withCredentials: true });
            setStoredSession(response.data.token, response.data.user.role, response.data.user, response.data.csrfToken);
            resetAuthFailureState();
            navigate('/dashboard');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Invalid code. Please try again.'));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleCredential = useCallback(async (resp: { credential: string }) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await api.post('/auth/google', { credential: resp.credential }, { withCredentials: true });
            setStoredSession(response.data.token, response.data.user.role, response.data.user, response.data.csrfToken);
            resetAuthFailureState();
            navigate('/dashboard');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Google sign-in failed. Make sure your account has been invited.'));
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    // Initialise Google Identity Services once the GSI script loads
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;
        const initGoogle = () => {
            if (!window.google) return;
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (resp) => void handleGoogleCredential(resp),
            });
            if (googleButtonRef.current) {
                window.google.accounts.id.renderButton(googleButtonRef.current, {
                    theme: 'outline',
                    size: 'large',
                    width: 360,
                    text: 'signin_with',
                });
            }
        };
        // GSI may already be loaded or still loading
        if (window.google) {
            initGoogle();
        } else {
            const script = document.querySelector<HTMLScriptElement>('script[src*="accounts.google.com/gsi/client"]');
            if (script) script.addEventListener('load', initGoogle);
        }
    }, [handleGoogleCredential]);

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

                {mfaRequired ? (
                <form method="post" onSubmit={handleMfaSubmit} className="login-form">
                    <div className="login-header" style={{ marginBottom: '1rem' }}>
                        <p className="login-kicker">Two-Factor Authentication</p>
                        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            Enter the 6-digit code from your authenticator app.
                        </p>
                    </div>
                    <div className="form-group icon-input">
                        <label className="form-label" htmlFor="totp">Authenticator Code</label>
                        <div className="input-wrapper">
                            <ShieldCheck className="input-icon" size={18} />
                            <input
                                id="totp"
                                name="totp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9 ]*"
                                maxLength={7}
                                className="form-control"
                                placeholder="000 000"
                                autoComplete="one-time-code"
                                autoFocus
                                value={totpCode}
                                onChange={e => setTotpCode(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                        {loading ? 'Verifying...' : 'Verify & Sign In'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ marginTop: '0.5rem', width: '100%' }}
                        onClick={() => { setMfaRequired(false); setTotpCode(''); setMfaChallengeToken(''); }}>
                        ← Back to login
                    </button>
                </form>
                ) : (
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
                )}

                {/* Google SSO — only shown when VITE_GOOGLE_CLIENT_ID is configured */}
                {GOOGLE_CLIENT_ID && !mfaRequired && (
                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                            <div style={{ flex: 1, height: 1, background: 'var(--color-border, #e2e8f0)' }} />
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>or continue with</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--color-border, #e2e8f0)' }} />
                        </div>
                        <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
                    </div>
                )}

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
