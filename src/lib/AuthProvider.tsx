import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type BusinessContext = {
  businessId: string;
  businessName: string;
  role: string;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  business: BusinessContext | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  business: null,
  loading: true,
  signIn: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function fetchBusinessContext(userId: string): Promise<BusinessContext | null> {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('business_id, role, businesses:business_id(id, name)')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) return null;

  const biz = data.businesses as unknown as { id: string; name: string } | null;
  return {
    businessId: data.business_id,
    businessName: biz?.name ?? data.business_id,
    role: data.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<BusinessContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const biz = await fetchBusinessContext(s.user.id);
        setBusiness(biz);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const biz = await fetchBusinessContext(s.user.id);
        setBusiness(biz);
      } else {
        setBusiness(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBusiness(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, business, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
