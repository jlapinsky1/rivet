import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type BusinessContext = {
  businessId: string;
  businessName: string;
  role: string;
  vertical?: string;
  slug?: string;
};

export type OtpIntent = 'signup' | 'login';
export type OtpVerificationType = 'magiclink' | 'invite' | 'email';

type SendCodeResult = {
  error: string | null;
  existingAccount: boolean;
  verificationType: OtpVerificationType;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  business: BusinessContext | null;
  loading: boolean;
  sendEmailCode: (input: {
    intent: OtpIntent;
    email: string;
    businessName?: string;
    contactName?: string;
  }) => Promise<SendCodeResult>;
  verifyEmailCode: (email: string, code: string, verificationType?: string) => Promise<{ error: string | null }>;
  provisionContractor: (input: { businessName: string; contactName?: string; vertical?: string }) => Promise<{ error: string | null }>;
  refreshBusiness: () => Promise<BusinessContext | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  business: null,
  loading: true,
  sendEmailCode: async () => ({ error: 'Not initialized', existingAccount: false, verificationType: 'magiclink' }),
  verifyEmailCode: async () => ({ error: 'Not initialized' }),
  provisionContractor: async () => ({ error: 'Not initialized' }),
  refreshBusiness: async () => null,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchBusinessContext(userId: string): Promise<BusinessContext | null> {
  // Query membership and business separately to avoid cross-table RLS join issues
  const { data: membership, error: memErr } = await supabase
    .from('business_memberships')
    .select('business_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (memErr || !membership) return null;

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, vertical, slug')
    .eq('id', membership.business_id)
    .single();

  return {
    businessId: membership.business_id,
    businessName: biz?.name ?? membership.business_id,
    role: membership.role,
    vertical: biz?.vertical,
    slug: biz?.slug,
  };
}

function friendlyAuthError(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes('expired') || lower.includes('invalid')) {
    return 'That code is expired or incorrect. Request a new one.';
  }
  if (lower.includes('rate limit')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  return message;
}

function asVerificationType(value: unknown): OtpVerificationType {
  if (value === 'invite' || value === 'email' || value === 'magiclink') return value;
  return 'magiclink';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<BusinessContext | null>(null);
  const [loading, setLoading] = useState(true);
  const businessFetch = useRef(0);

  const applyBusiness = useCallback(async (userId: string | null) => {
    const ticket = ++businessFetch.current;
    if (!userId) {
      if (ticket === businessFetch.current) setBusiness(null);
      return null;
    }
    const biz = await fetchBusinessContext(userId);
    if (ticket !== businessFetch.current) return biz;
    setBusiness(biz);
    return biz;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      await applyBusiness(s?.user?.id ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      void applyBusiness(s?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [applyBusiness]);

  const refreshBusiness = useCallback(async () => {
    const { data: { user: current } } = await supabase.auth.getUser();
    return applyBusiness(current?.id ?? null);
  }, [applyBusiness]);

  const sendEmailCode = useCallback(async (input: {
    intent: OtpIntent;
    email: string;
    businessName?: string;
    contactName?: string;
  }) => {
    try {
      const res = await fetch('/api/contractor-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.sent !== true) {
        return {
          error: body.error || 'Could not send a sign-in code. Please try again.',
          existingAccount: false,
          verificationType: 'magiclink' as const,
        };
      }
      return {
        error: null,
        existingAccount: Boolean(body.existingAccount),
        verificationType: asVerificationType(body.verificationType),
      };
    } catch {
      return {
        error: 'Could not reach Rivet. Check your connection and try again.',
        existingAccount: false,
        verificationType: 'magiclink' as const,
      };
    }
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string, verificationType?: string) => {
    const normalized = email.trim().toLowerCase();
    const { data: { session: existing } } = await supabase.auth.getSession();
    if (existing?.user?.email?.toLowerCase() === normalized) {
      return { error: null };
    }

    const { error } = await supabase.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: asVerificationType(verificationType),
    });
    return { error: friendlyAuthError(error?.message ?? null) };
  }, []);

  const provisionContractor = useCallback(async (input: { businessName: string; contactName?: string; vertical?: string }) => {
    const { data: { session: current } } = await supabase.auth.getSession();
    const token = current?.access_token;
    if (!token) return { error: 'Sign-in expired. Request a new code.' };

    try {
      const res = await fetch('/api/provision-contractor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.businessId) return { error: body.error || 'Could not create your business.' };
      return { error: null };
    } catch {
      return { error: 'Could not reach Rivet. Check your connection and try again.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    businessFetch.current += 1;
    await supabase.auth.signOut();
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      user,
      business,
      loading,
      sendEmailCode,
      verifyEmailCode,
      provisionContractor,
      refreshBusiness,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
