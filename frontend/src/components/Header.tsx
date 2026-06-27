import React from "react";
import { useTheme } from "./ThemeProvider";

interface HeaderProps {
  refreshedAt: Date;
  refreshing: boolean;
  ingestError: string | null;
  onRefresh: () => void;
}

export function Header({ refreshedAt, refreshing, ingestError, onRefresh }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] text-slate-800 dark:text-white shrink-0">
      <div className="w-full px-6 py-4 flex items-center justify-between gap-6">
        <div className="flex items-baseline gap-2">
          <h1 className="font-sans text-xl font-bold tracking-tight">Timeline Dashboard</h1>
          <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-450 ml-2">
            Overview
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 font-mono uppercase tracking-wider text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
          <span>
            Refreshed at: {refreshedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Toggle Theme"
          >
            {theme === "dark" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 h-8 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {refreshing ? "Ingesting…" : "Refresh"}
          </button>
        </div>
      </div>
      {ingestError && (
        <div className="w-full px-6 pb-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-500 px-3 py-2 text-xs">
            Ingest failed: {ingestError}
          </div>
        </div>
      )}
    </header>
  );
}
