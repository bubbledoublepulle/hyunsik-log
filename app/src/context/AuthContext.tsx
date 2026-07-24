import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type UserRole = "visitor" | "admin";

interface AuthContextType {
  role: UserRole;
  isAdmin: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "hsik_auth_token";

function loadPersistedToken(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("visitor");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    const token = loadPersistedToken();
    if (token) {
      verifyToken(token).then((valid) => {
        if (valid) {
          setRole("admin");
        } else {
          try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { }
        }
      });
    }
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      if (data.success && data.token) {
        setRole("admin");
        try { localStorage.setItem(AUTH_STORAGE_KEY, data.token); } catch { }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setRole("visitor");
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        role,
        isAdmin: role === "admin",
        login,
        logout,
        authModalOpen,
        setAuthModalOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/verify`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.valid === true;
  } catch {
    return false;
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
