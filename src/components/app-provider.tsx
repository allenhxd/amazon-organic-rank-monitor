"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AppSnapshot } from "@/domain/types";

type AppContextValue = {
  snapshot: AppSnapshot;
  refresh: () => Promise<AppSnapshot>;
  replaceSnapshot: (next: AppSnapshot) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ initialSnapshot, children }: { initialSnapshot: AppSnapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(body.error || "刷新数据失败");
    setSnapshot(body.data);
    return body.data as AppSnapshot;
  }, []);
  const value = useMemo(() => ({ snapshot, refresh, replaceSnapshot: setSnapshot }), [snapshot, refresh]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppSnapshot() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppSnapshot 必须在 AppProvider 内使用");
  return context;
}
