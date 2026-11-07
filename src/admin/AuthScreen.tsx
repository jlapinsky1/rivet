import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthProvider';
import type { OtpIntent, OtpVerificationType } from '../lib/AuthProvider';

type Step = 'details' | 'code' | 'finish';

function Brand() {
  return (
    <div className="login-brand">
      <div className="login-brand-mark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
      <span className="login-brand-name">Rivet</span>
    </div>
  );
}

export default function AuthScreen({
  mode,
  sessionEmail,
  onSignOut,
}: {
  mode: OtpIntent;
  sessionEmail?: string | null;
  onSignOut: () => void;
}) {
  const { sendEmailCode, verifyEmailCode, provisionContractor, refreshBusiness } = useAuth();
  const [step, setStep] = useState<Step>(sessionEmail ? 'finish' : 'details');
  const [businessName, setBusinessName] = useState('');
  const [vertical, setVertical] = useState<'handyman' | 'junk_removal'>('handyman');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState(sessionEmail || '');
  const [code, setCode] = useState('');
  const [verificationType, setVerificationType] = useState<OtpVerificationType>('magiclink');
  const [existingAccount, setExistingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await sendEmailCode({
      intent: mode,
      email,
      businessName,
      contactName,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setVerificationType(result.verificationType);
    setExistingAccount(result.existingAccount);
    setStep('code');
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const verified = await verifyEmailCode(email, code, verificationType);
    if (verified.error) {
      setError(verified.error);
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const provisioned = await provisionContractor({ businessName, contactName, vertical });
      if (provisioned.error) {
        setError(provisioned.error);
        setStep('finish');
        setLoading(false);
        return;
      }
    }

    const biz = await refreshBusiness();
    setLoading(false);
    if (!biz) setStep('finish');
  }

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const provisioned = await provisionContractor({ businessName, contactName, vertical });
    if (provisioned.error) {
      setError(provisioned.error);
      setLoading(false);
      return;
    }
    const biz = await refreshBusiness();
    setLoading(false);
    if (!biz) setError('Your business was not created. Try again.');
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    const result = await sendEmailCode({
      intent: mode,
      email,
      businessName,
      contactName,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setVerificationType(result.verificationType);
    setExistingAccount(result.existingAccount);
    setCode('');
  }

  const title = step === 'code'
    ? 'Enter your code'
    : step === 'finish'
      ? 'Name your business'
      : mode === 'signup'
        ? 'Create your account'
        : 'Sign in';

  const subtitle = step === 'code'
    ? `We sent a new one-time code to ${email}. It works once.`
    : step === 'finish'
      ? 'You are signed in. Name the business to open Rivet.'
      : mode === 'signup'
        ? 'For contractors. We’ll email a new one-time code. No password.'
        : 'We’ll email a new one-time code. No password.';

  return (
    <div className="login-page">
      <div className="login-card">
        <Brand />
        <p className="login-subtitle">{title}</p>
        <p className="login-hint">{subtitle}</p>

        {step === 'details' && (
          <form onSubmit={handleDetails}>
            {mode === 'signup' && (
              <>
                <div className="login-field">
                  <label htmlFor="business-name">Business name</label>
                  <input
                    id="business-name"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    required
                    autoFocus
                    autoComplete="organization"
                    placeholder="Northside Handyman"
                  />
                </div>
                <div className="login-field">
                  <label htmlFor="vertical">What type of business?</label>
                  <select
                    id="vertical"
                    value={vertical}
                    onChange={e => setVertical(e.target.value as 'handyman' | 'junk_removal')}
                    required
                  >
                    <option value="handyman">Handyman</option>
                    <option value="junk_removal">Junk Removal</option>
                  </select>
                </div>
                <div className="login-field">
                  <label htmlFor="contact-name">Your name</label>
                  <input
                    id="contact-name"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Alex Rivera"
                  />
                </div>
              </>
            )}
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus={mode === 'login'}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" disabled={loading} className="login-submit">
              {loading ? 'Sending code...' : 'Email me a code'}
            </button>
            <p className="login-alt">
              {mode === 'signup' ? (
                <>Already have an account? <Link to="/login">Log in</Link></>
              ) : (
                <>New contractor? <Link to="/signup">Start free</Link></>
              )}
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCode}>
            {existingAccount && (
              <div className="login-note">This email already has an account. Enter the code to sign in.</div>
            )}
            <div className="login-field">
              <label htmlFor="otp-code">One-time code</label>
              <input
                id="otp-code"
                className="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                maxLength={8}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                autoFocus
                placeholder="000000"
              />
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" disabled={loading || code.length < 6} className="login-submit">
              {loading ? 'Checking...' : mode === 'signup' && !existingAccount ? 'Create account' : 'Sign in'}
            </button>
            <button type="button" className="login-text-btn" onClick={handleResend} disabled={loading}>
              Email a new code
            </button>
            <button
              type="button"
              className="login-text-btn"
              onClick={() => { setStep('details'); setCode(''); setError(null); setExistingAccount(false); }}
              disabled={loading}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'finish' && (
          <form onSubmit={handleFinish}>
            <div className="login-field">
              <label htmlFor="finish-business-name">Business name</label>
              <input
                id="finish-business-name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                required
                autoFocus
                autoComplete="organization"
                placeholder="Northside Handyman"
              />
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" disabled={loading} className="login-submit">
              {loading ? 'Creating...' : 'Open Rivet'}
            </button>
            <button type="button" className="login-text-btn" onClick={onSignOut} disabled={loading}>
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
