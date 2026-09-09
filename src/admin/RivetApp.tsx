import { useState } from 'react';
import { AuthProvider, useAuth } from '../lib/AuthProvider';
import RivetDashboard from './RivetDashboard';
import './admin.css';

function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    if (result.error) setError(result.error);
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="login-brand-name">Rivet</span>
        </div>
        <p className="login-subtitle">Sign in to your account</p>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RivetAppContent() {
  const { loading, session, user, business, signOut } = useAuth();

  // Loading
  if (loading) {
    return (
      <div className="login-page">
        <div className="login-loading">
          <div className="login-spinner" />
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return <LoginScreen />;
  }

  const displayName = (user?.user_metadata?.display_name as string) || business?.businessName || 'there';
  const businessName = business?.businessName ?? 'My Business';
  const words = businessName.split(' ');
  const businessInitials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : words[0].slice(0, 2).toUpperCase();

  return (
    <RivetDashboard
      businessName={businessName}
      businessInitials={businessInitials}
      displayName={displayName}
      onSignOut={signOut}
    />
  );
}

export default function RivetApp() {
  return (
    <AuthProvider>
      <RivetAppContent />
    </AuthProvider>
  );
}
