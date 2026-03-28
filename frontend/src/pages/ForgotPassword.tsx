import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import './Login.css';
import { usePageMetadata } from '../hooks/usePageMetadata';

type Step = 'email' | 'code' | 'done';

const ForgotPassword: React.FC = () => {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetCode, setResetCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    usePageMetadata({
        title: 'Reset Password | Web Forx Time Tracker',
        description: 'Securely reset your Web Forx Time Tracker password and restore access to your workspace.',
        ogTitle: 'Reset Password - Web Forx Time Tracker',
        ogDescription: 'Use your reset code to set a new password for Web Forx Time Tracker.',
        canonical: '/forgot-password',
        noIndex: true,
    });

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await api.post('/auth/forgot-password', { email });
            if (res.data.reset_code) {
                setResetCode(res.data.reset_code);
            }
            setStep('code');
        } catch {
            setError('Failed to process request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            await api.post('/auth/reset-password', { code, password: newPassword });
            setStep('done');
        } catch {
            setError('Invalid or expired reset code. Please try again.');
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
                        <p>Password Recovery</p>
                    </div>
                </div>
                <div className="login-side-highlights">
                    <div className="side-highlight">
                        <ShieldCheck size={18} />
                        <div>
                            <strong>Secure reset process</strong>
                            <span>A unique code is generated for your account.</span>
                        </div>
                    </div>
                    <div className="side-highlight">
                        <KeyRound size={18} />
                        <div>
                            <strong>One-time codes</strong>
                            <span>Codes expire after 30 minutes for security.</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="login-card">
                {step === 'email' && (
                    <>
                        <div className="login-header">
                            <p className="login-kicker">Forgot Password</p>
                            <h1>Reset Your Password</h1>
                            <p>Enter your work email and we will generate a reset code.</p>
                        </div>

                        {error && <div className="login-error">{error}</div>}

                        <form method="post" onSubmit={handleRequestReset} className="login-form">
                            <div className="form-group icon-input">
                                <label className="form-label" htmlFor="reset-email">Work Email</label>
                                <div className="input-wrapper">
                                    <Mail className="input-icon" size={18} />
                                    <input
                                        id="reset-email"
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
                            <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                                {loading ? 'Processing...' : 'Get Reset Code'}
                            </button>
                        </form>

                    </>
                )}

                {step === 'code' && (
                    <>
                        <div className="login-header">
                            <p className="login-kicker">Step 2</p>
                            <h1>Enter Reset Code</h1>
                            <p>Enter the reset code and choose a new password.</p>
                        </div>

                        {resetCode && (
                            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Your reset code:</p>
                                <p style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.15em', fontFamily: 'monospace' }}>{resetCode}</p>
                            </div>
                        )}

                        {error && <div className="login-error">{error}</div>}

                        <form method="post" onSubmit={handleResetPassword} className="login-form">
                            <div className="form-group icon-input">
                                <label className="form-label" htmlFor="reset-code">Reset Code</label>
                                <div className="input-wrapper">
                                    <KeyRound className="input-icon" size={18} />
                                    <input
                                        id="reset-code"
                                        name="code"
                                        type="text"
                                        className="form-control"
                                        placeholder="Enter 8-character code"
                                        autoComplete="one-time-code"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                                        maxLength={8}
                                        required
                                        style={{ letterSpacing: '0.15em', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>
                            <div className="form-group icon-input">
                                <label className="form-label" htmlFor="new-password">New Password</label>
                                <div className="input-wrapper">
                                    <KeyRound className="input-icon" size={18} />
                                    <input
                                        id="new-password"
                                        name="newPassword"
                                        type="password"
                                        className="form-control"
                                        placeholder="Min 6 characters"
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group icon-input">
                                <label className="form-label" htmlFor="confirm-password">Confirm Password</label>
                                <div className="input-wrapper">
                                    <KeyRound className="input-icon" size={18} />
                                    <input
                                        id="confirm-password"
                                        name="confirmPassword"
                                        type="password"
                                        className="form-control"
                                        placeholder="Re-enter password"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                                {loading ? 'Resetting...' : 'Reset Password'}
                            </button>
                        </form>
                    </>
                )}

                {step === 'done' && (
                    <>
                        <div className="login-header" style={{ textAlign: 'center' }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                <ShieldCheck size={28} color="#16a34a" />
                            </div>
                            <h1>Password Reset!</h1>
                            <p>Your password has been updated successfully. You can now sign in with your new password.</p>
                        </div>
                        <button type="button" className="btn btn-primary login-btn" onClick={() => navigate('/login')}>
                            Go to Sign In
                        </button>
                    </>
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

export default ForgotPassword;
