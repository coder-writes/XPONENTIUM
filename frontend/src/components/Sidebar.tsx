import React from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Clock, Layers, Globe, Database, Info } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-[260px] bg-slate-50 dark:bg-[#0B1120] text-slate-700 dark:text-slate-300 flex flex-col h-full sticky top-0 shrink-0 border-r border-slate-200 dark:border-slate-800">
      <div className="px-6 py-6 h-[80px] flex items-center border-b border-slate-200 dark:border-slate-800">
        <Link to="/" className="flex items-center gap-3 w-full group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Activity className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-sans text-[18px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">News Pulse</h1>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider font-medium">Clustered News Timeline</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 mt-2">
        <Link 
          to="/" 
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50 [&.active]:bg-slate-200 dark:[&.active]:bg-[#1E293B] text-slate-600 dark:text-slate-400 [&.active]:text-blue-600 dark:[&.active]:text-blue-400"
        >
          <Activity className="h-[18px] w-[18px]" />
          Timeline
        </Link>
        <Link 
          to="/clusters" 
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
        >
          <Layers className="h-[18px] w-[18px]" />
          Clusters
        </Link>
        <Link 
          to="/sources" 
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
        >
          <Globe className="h-[18px] w-[18px]" />
          Sources
        </Link>
        <Link 
          to="/ingestion" 
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
        >
          <Database className="h-[18px] w-[18px]" />
          Ingestion
        </Link>
        <Link 
          to="/about" 
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
        >
          <Info className="h-[18px] w-[18px]" />
          About
        </Link>
      </nav>

      <div className="p-4 mt-auto">
        <div className="flex items-center gap-3 rounded-xl bg-slate-100 dark:bg-[#151C2C] px-4 py-3 border border-slate-200 dark:border-slate-800/50">
          <div className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </div>
          <div className="flex flex-col">
            <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-200 leading-tight">System Status</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">All systems operational</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
