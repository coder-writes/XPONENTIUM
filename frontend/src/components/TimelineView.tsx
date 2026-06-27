import React, { useMemo } from "react";
import type { TimelineCluster } from "../api";
import { Landmark, Activity, Cpu, Leaf, Trophy, Globe, FileText } from "lucide-react";
import clsx from "clsx";

interface TimelineViewProps {
  timeline: TimelineCluster[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hydrated: boolean;
}

const getCategoryIcon = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("tech") || l.includes("ai") || l.includes("cyber")) return <Cpu className="h-4 w-4" />;
  if (l.includes("climate") || l.includes("environment")) return <Leaf className="h-4 w-4" />;
  if (l.includes("economy") || l.includes("bank") || l.includes("market") || l.includes("finance")) return <Landmark className="h-4 w-4" />;
  if (l.includes("sport") || l.includes("olympic") || l.includes("cup") || l.includes("cricket") || l.includes("football")) return <Trophy className="h-4 w-4" />;
  if (l.includes("global") || l.includes("world") || l.includes("war") || l.includes("conflict") || l.includes("international")) return <Globe className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
};

const getIntensityColors = (intensity: number | string | undefined) => {
  if (typeof intensity === "number") {
    if (intensity >= 0.8) return "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
    if (intensity >= 0.5) return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
    if (intensity >= 0.2) return "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
    return "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]";
  }
  const i = String(intensity || "high").toLowerCase();
  if (i.includes("very high")) return "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
  if (i.includes("high")) return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
  if (i.includes("medium")) return "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
  return "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]";
};

export function TimelineView({ timeline, selectedId, onSelect, hydrated }: TimelineViewProps) {
  // Sort timeline items chronologically (latest first)
  const sorted = useMemo(() => {
    return [...timeline].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }, [timeline]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
      <div className="relative">
        {/* Continuous Vertical Line */}
        <div className="absolute left-[39px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-800"></div>

        <div className="space-y-6">
          {sorted.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 ml-10">
              No clusters available. Wait for ingestion or trigger a refresh.
            </div>
          ) : (
            sorted.map((cluster) => {
              const isSelected = selectedId === cluster.cluster_key;
              const dateObj = new Date(cluster.start);
              const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              const intensity = cluster.intensity !== undefined ? cluster.intensity : 0.5;

              return (
                <div 
                  key={cluster.cluster_key}
                  className="relative flex items-start gap-8 group"
                >
                  {/* Timeline Dot & Line Segment */}
                  <div className="flex flex-col items-center mt-1.5 shrink-0 z-10 w-20">
                    <div className="text-right w-full mb-1">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{dateStr}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{timeStr}</div>
                    </div>
                  </div>
                  
                  {/* The dot */}
                  <div className="absolute left-[35px] top-[14px] z-20">
                    <div className={clsx("h-[9px] w-[9px] rounded-full border-2 border-white dark:border-[#0F172A]", getIntensityColors(intensity))} />
                  </div>

                  {/* Card Content */}
                  <button
                    onClick={() => onSelect(cluster.cluster_key)}
                    className={clsx(
                      "flex-1 flex gap-4 p-4 rounded-xl border transition-all text-left",
                      isSelected 
                        ? "bg-slate-100 dark:bg-[#1E293B] border-slate-300 dark:border-slate-600 shadow-sm" 
                        : "bg-white dark:bg-[#151C2C] border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    <div className={clsx(
                      "flex items-center justify-center h-10 w-10 rounded-xl shrink-0 mt-0.5",
                      isSelected 
                        ? "bg-blue-600/20 text-blue-600 dark:text-blue-400" 
                        : "bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                    )}>
                      {getCategoryIcon(cluster.label)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 leading-tight mb-1">
                        {cluster.label}
                      </h3>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                        Topics spanning multiple media platforms reporting on the event.
                      </p>
                      
                      <div className="flex items-center gap-3 mt-3">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                          <FileText className="h-3 w-3" />
                          {cluster.article_count} articles
                        </span>
                        <span className="h-3 w-px bg-slate-300 dark:bg-slate-700"></span>
                        <div className="flex -space-x-1.5">
                          {Array.from({ length: Math.min(3, cluster.article_count) }).map((_, i) => (
                            <div key={i} className="h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-800 border border-white dark:border-[#151C2C] flex items-center justify-center text-[7px] font-bold text-slate-500 dark:text-slate-400">
                              N
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
