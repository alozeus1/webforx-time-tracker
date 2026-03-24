import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import api from '../services/api';
import './Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user_role', response.data.user.role);
            navigate('/dashboard');
        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <div className="logo-icon-large">TF</div>
                    </div>
                    <h1>Web Forx Time Tracker</h1>
                    <p>Login to your account to start tracking</p>
                </div>

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
                    <p>Need access? Contact your Admin.</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
