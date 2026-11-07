import { useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/AuthProvider';
import RivetDashboard from './RivetDashboard';
import AuthScreen from './AuthScreen';
import './admin.css';

function RivetAppContent() {
  const { loading, session, user, business, signOut } = useAuth();
  const location = useLocation();

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

  // Sign-up and sign-in stay on this screen until the contractor has a business.
  if (!session || !business) {
    return (
      <AuthScreen
        mode={location.pathname === '/signup' ? 'signup' : 'login'}
        sessionEmail={session?.user?.email ?? null}
        onSignOut={signOut}
      />
    );
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
