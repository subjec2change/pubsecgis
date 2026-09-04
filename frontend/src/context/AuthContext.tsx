import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, AuthResponse } from '../types';
import * as api from '../api/endpoints';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const data: AuthResponse = await api.login(username, password);
      const tokenValue = data.access_token || '';
      localStorage.setItem('access_token', tokenValue);
      setToken(tokenValue);

      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
  }, []);

  // Check existing token on mount
  useEffect(() => {
    if (token) {
      api.getCurrentUser()
        .then(setUser)
        .catch(() => {
          logout();
        });
    }
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!token, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
