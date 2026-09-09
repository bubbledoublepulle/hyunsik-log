import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const TOKEN_KEY = 'siklog_admin_token';

export function AuthProvider({ children }) {
  const [role, setRole] = useState('visitor');
  const [isAdmin, setIsAdmin] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const verify = async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) { setIsAuthLoading(false); return; }
        const res = await fetch('/api/verify', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) { setRole('admin'); setIsAdmin(true); }
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) { console.error(e); }
      finally { setIsAuthLoading(false); }
    };
    verify();
  }, []);

  const login = useCallback(async (password) => {
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!res.ok) return false;
      const r = await res.json();
      if (r.success && r.token) { localStorage.setItem(TOKEN_KEY, r.token); setRole('admin'); setIsAdmin(true); return true; }
      return false;
    } catch { return false; }
  }, []);

  const logout = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setRole('visitor'); setIsAdmin(false); }, []);

  return <AuthContext.Provider value={{ role, isAdmin, isVisitor: role === 'visitor', isAuthLoading, login, logout, authModalOpen, setAuthModalOpen }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be in AuthProvider');
  return c;
};
