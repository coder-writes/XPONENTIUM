import React, { useState } from "react";
import { type ClusterDetail } from "../api";
import { X, Calendar, FileText, Network, ExternalLink, ArrowRight, ArrowLeft } from "lucide-react";
import clsx from "clsx";

interface ClusterDetailViewProps {
  cluster: ClusterDetail;
  onClose: () => void;
}

const getIntensityStyles = (intensity: string | number | undefined) => {
  const val = typeof intensity === "number" ? (intensity >= 0.8 ? "Very High" : intensity >= 0.5 ? "High" : intensity >= 0.2 ? "Medium" : "Low") : String(intensity || "High");
  const i = val.toLowerCase();
  if (i.includes("very high")) return "bg-purple-150 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30";
  if (i.includes("high")) return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30";
  if (i.includes("medium")) return "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border border-green-200 dark:border-green-500/30";
  if (i.includes("low")) return "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30";
  return "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-200 dark:border-slate-500/30";
};

// Function to determine source logo styling
const getSourceLogoStyle = (sourceName: string) => {
  const name = sourceName.toLowerCase();
  if (name.includes("bbc")) return "bg-black text-white font-serif";
  if (name.includes("reuters")) return "bg-[#FF8000] text-white font-bold";
  if (name.includes("npr")) return "bg-white text-black font-bold border border-slate-350";
  if (name.includes("guardian")) return "bg-[#052962] text-white font-serif";
  if (name.includes("cnn")) return "bg-[#CC0000] text-white font-bold";
  if (name.includes("fox")) return "bg-[#003366] text-white font-bold";
  if (name.includes("al jazeera")) return "bg-[#F9A01B] text-black font-bold";
  if (name.includes("york times") || name.includes("nyt")) return "bg-white text-black font-serif border border-slate-300";
  if (name.includes("wall street") || name.includes("wsj")) return "bg-black text-white font-serif";
  if (name.includes("bloomberg")) return "bg-black text-white font-bold";
  if (name.includes("associated press") || name.includes("ap")) return "bg-[#FF3333] text-white font-bold";
  if (name.includes("afp")) return "bg-[#0055A4] text-white font-bold";
  if (name.includes("cnbc")) return "bg-[#0033A0] text-white font-bold";
  if (name.includes("msnbc")) return "bg-black text-white font-bold";
  if (name.includes("washington post") || name.includes("wapo")) return "bg-black text-white font-serif";
  return "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium";
};

// Function to format source name for logo
const formatLogoText = (sourceName: string) => {
  const lower = sourceName.toLowerCase();
  if (lower.includes("bbc")) return "BBC";
  if (lower.includes("reuters")) return "REUTERS";
  if (lower.includes("npr")) return "n p r";
  if (lower.includes("guardian")) return "The\nGuardian";
  if (lower.includes("cnn")) return "CNN";
  if (lower.includes("fox")) return "FOX";
  if (lower.includes("al jazeera")) return "AJ";
  if (lower.includes("york times") || lower.includes("nyt")) return "NYT";
  if (lower.includes("wall street") || lower.includes("wsj")) return "WSJ";
  if (lower.includes("bloomberg")) return "BBG";
  if (lower.includes("associated press") || lower.includes("ap")) return "AP";
  if (lower.includes("afp")) return "AFP";
  if (lower.includes("cnbc")) return "CNBC";
  if (lower.includes("msnbc")) return "MSNBC";
  if (lower.includes("washington post") || lower.includes("wapo")) return "WP";
  return sourceName.substring(0, 3).toUpperCase();
};

export function ClusterDetailView({ cluster, onClose }: ClusterDetailViewProps) {
  const [showAll, setShowAll] = useState(false);

  const startDate = new Date(cluster.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = new Date(cluster.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  
  // Try to find the normalized intensity from the timeline, fallback to static High
  const intensity = "High";

  // Compute unique sources
  const sources = Array.from(new Set(cluster.articles.map(a => a.source || "Unknown")));
  const sourcesText = sources.length > 0 ? sources.slice(0, 3).join(", ") + (sources.length > 3 ? ", etc." : "") : "N/A";

  const displayedArticles = showAll ? cluster.articles : cluster.articles.slice(0, 2);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0B1120] text-slate-800 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 shrink-0 border-b border-slate-200 dark:border-slate-800/80">
        <h2 className="font-semibold text-base text-slate-900 dark:text-white">Cluster Details</h2>
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-white transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-800/60">
          <span className={clsx("inline-block text-[11px] font-medium px-2.5 py-1 rounded mb-4", getIntensityStyles(intensity))}>
            {intensity}
          </span>
          <h1 className="text-xl font-bold font-sans tracking-tight leading-tight mb-3 text-slate-900 dark:text-white">
            {cluster.label}
          </h1>
          <p className="text-[13px] text-slate-650 dark:text-slate-350 leading-relaxed mb-6">
            A cluster containing multiple matching news reports on: "{cluster.label}".
          </p>

          <div className="flex flex-col gap-3 text-[13px] text-slate-600 dark:text-slate-300">
             <div className="flex items-center gap-3">
               <Calendar className="h-[15px] w-[15px] text-slate-400 dark:text-slate-500" />
               <span>{startDate} &ndash; {endDate}</span>
             </div>
             <div className="flex items-center gap-3">
               <FileText className="h-[15px] w-[15px] text-slate-400 dark:text-slate-500" />
               <span>{cluster.articles.length} articles</span>
             </div>
             <div className="flex items-center gap-3">
               <Network className="h-[15px] w-[15px] text-slate-400 dark:text-slate-500" />
               <span>Sources: {sourcesText}</span>
             </div>
          </div>
        </div>

        <div className="px-6 py-6">
          <h3 className="font-semibold text-[13px] text-slate-900 dark:text-white mb-4">Articles in this cluster</h3>
          
          <div className="space-y-3">
            {displayedArticles.map((article) => {
              const pubDate = new Date(article.published_at);
              const dateStr = pubDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const timeStr = pubDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              
              return (
                <a 
                  key={article.id} 
                  href={article.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-[#151C2C] border border-slate-200 dark:border-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors group"
                >
                  <div className={clsx(
                    "flex flex-col items-center justify-center w-12 h-12 rounded-md shrink-0 text-[9px] leading-tight text-center p-1 overflow-hidden", 
                    getSourceLogoStyle(article.source || "")
                  )}>
                    {formatLogoText(article.source || "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-[13px] text-slate-900 dark:text-white leading-snug line-clamp-2 pr-2">
                      {article.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      {dateStr} &bull; {timeStr}
                    </p>
                  </div>
                  <ExternalLink className="h-[15px] w-[15px] text-slate-450 dark:text-slate-500 shrink-0 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                </a>
              );
            })}
          </div>

          {cluster.articles.length > 2 && (
            <div className="mt-6">
              <button 
                onClick={() => setShowAll(!showAll)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 dark:border-blue-900/50 text-slate-700 dark:text-blue-400 text-[13px] font-medium hover:bg-slate-100 dark:hover:bg-blue-900/20 transition-colors"
              >
                {showAll ? (
                  <>
                    Show less
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    View all {cluster.articles.length} articles
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
