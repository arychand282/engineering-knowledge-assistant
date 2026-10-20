"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getStoredDevUserId, setStoredDevUserId } from "@/lib/client/dev-user";

interface DevUserContextValue {
  userId: string | null;
  setUserId: (userId: string) => void;
}

const DevUserContext = createContext<DevUserContextValue>({
  userId: null,
  setUserId: () => {},
});

export function DevUserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);

  useEffect(() => {
    // Reading localStorage must happen client-side only (SSR/hydration safety) —
    // this is the standard pattern for that, not a derivable-from-render value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserIdState(getStoredDevUserId());
  }, []);

  function setUserId(id: string) {
    setStoredDevUserId(id);
    setUserIdState(id);
  }

  return (
    <DevUserContext.Provider value={{ userId, setUserId }}>{children}</DevUserContext.Provider>
  );
}

export function useDevUser(): DevUserContextValue {
  return useContext(DevUserContext);
}
