import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const success = await login(username, password);
      if (success) {
        navigate('/officer');
      } else {
        setError('Invalid credentials. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('Login failed. Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-glow" />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-icon">🛡️</div>
          <h1>Officer Dashboard</h1>
          <p className="subtitle">BJC Public Safety — Barnes-Jewish Hospital</p>
        </div>

        {error && <div className="login-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            placeholder="your.username"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-spinner">
                <svg className="spin" viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
                </svg>
                Authenticating
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <span>Internal Network Access Only</span>
        </div>
      </div>
    </div>
  );
}
