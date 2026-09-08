import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { getRepo } from '../utils/repository';
import type { User } from '@supabase/supabase-js';
import RivetDashboard from './RivetDashboard';
import './admin.css';

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const repo = await getRepo();
      await repo.signIn(email, password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
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

export default function RivetApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [businessName, setBusinessName] = useState('');
  const [businessInitials, setBusinessInitials] = useState('');

  useEffect(() => {
    let unsub: any;
    (async () => {
      const repo = await getRepo();
      const session = await repo.getSession();
      setUser(session || null);

      if (session) {
        loadBusinessContext();
      }

      if (repo.onAuthStateChange) {
        const { data } = repo.onAuthStateChange((u: any) => {
          setUser(u || null);
          if (u) loadBusinessContext();
        });
        unsub = data?.subscription;
      }
    })();
    return () => unsub?.unsubscribe?.();
  }, []);

  async function loadBusinessContext() {
    try {
      const repo = await getRepo();
      const ctx = await repo.getBusinessContext();
      if (ctx?.business) {
        setBusinessName(ctx.business.name || '');
        const words = (ctx.business.name || '').split(' ');
        setBusinessInitials(
          words.length >= 2
            ? (words[0][0] + words[1][0]).toUpperCase()
            : (words[0] || '').slice(0, 2).toUpperCase()
        );
      }
    } catch {
      // Business context may not be available yet
    }
  }

  async function handleSignOut() {
    const repo = await getRepo();
    await repo.signOut();
    setUser(null);
  }

  // Loading
  if (user === undefined) {
    return (
      <div className="login-page">
        <div className="login-loading">
          <div className="login-spinner" />
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <LoginScreen
        onLogin={() =>
          getRepo()
            .then(r => r.getSession())
            .then(s => {
              setUser(s);
              if (s) loadBusinessContext();
            })
        }
      />
    );
  }

  return (
    <RivetDashboard
      businessName={businessName || 'My Business'}
      businessInitials={businessInitials || 'MB'}
      onSignOut={handleSignOut}
    />
  );
}
