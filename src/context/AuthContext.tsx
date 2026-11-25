import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  setMemoryToken,
  type ProviderStatus,
  type UserProfile,
} from '../services/api';

interface AuthContextValue {
  user: UserProfile | null;
  providerStatus: ProviderStatus | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string, department?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest<{
        token: string;
        user: UserProfile;
        providerStatus: ProviderStatus;
      }>('/api/auth/me');
      setMemoryToken(data.token);
      setUser(data.user);
      setProviderStatus(data.providerStatus);
    } catch {
      setMemoryToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{
      token: string;
      user: UserProfile;
      providerStatus: ProviderStatus;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    setProviderStatus(data.providerStatus);
  }, []);

  const signup = useCallback(
    async (fullName: string, email: string, password: string, department?: string) => {
      const data = await apiRequest<{
        token: string;
        user: UserProfile;
        providerStatus: ProviderStatus;
      }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, department }),
      });
      setMemoryToken(data.token);
      setUser(data.user);
      setProviderStatus(data.providerStatus);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear local auth state regardless
    } finally {
      setMemoryToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, providerStatus, loading, login, signup, logout, refreshSession, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
