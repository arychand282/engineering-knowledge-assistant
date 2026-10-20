"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, parseJsonOrThrow } from "@/lib/client/api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  user: null,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/auth/me");
      if (!res.ok) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      const data = await parseJsonOrThrow<{ user: AuthUser }>(res);
      setUser(data.user);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    // Standard session check on mount — setState inside refresh only runs after its
    // internal await, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
