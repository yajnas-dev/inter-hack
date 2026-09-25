import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginBody, RegisterBody, UserDTO } from '@jobportal/shared';
import { http, refreshSession, setAccessToken, setAuthLostHandler, type AuthResponse } from '../../shared/api/http';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: UserDTO | null;
  login: (body: LoginBody) => Promise<UserDTO>;
  register: (body: RegisterBody) => Promise<UserDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<UserDTO | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the httpOnly refresh cookie (the access token itself is memory-only).
  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setUser(session.user);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // An API call failed and the silent refresh could not save it: the session is over.
  // A visitor who never signed in has no session to lose, so a stray 401 must not wipe the query cache.
  const signedIn = useRef(false);
  signedIn.current = user !== null;
  useEffect(() => {
    setAuthLostHandler(() => {
      if (signedIn.current) clearSession();
    });
    return () => setAuthLostHandler(null);
  }, [clearSession]);

  const start = useCallback((data: AuthResponse) => {
    setAccessToken(data.token);
    setUser(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      login: async (body) => start((await http.post<AuthResponse>('/auth/login', body)).data),
      register: async (body) => start((await http.post<AuthResponse>('/auth/register', body)).data),
      logout: async () => {
        await http.post('/auth/logout').catch(() => undefined); // revokes the refresh token server-side
        clearSession();
      }
    }),
    [status, user, start, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
