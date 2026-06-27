import React from "react";
import type { ClusterDetail } from "../api";

interface ClusterDetailViewProps {
  cluster: ClusterDetail;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ClusterDetailView({ cluster }: ClusterDetailViewProps) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_2.5fr]">
      <aside className="rounded-lg border border-border bg-card p-6 shadow-sm h-fit sticky top-24">
        <h3 className="font-serif text-xl font-bold leading-tight">
          {cluster.label}
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          {cluster.article_count} articles
        </p>
        
        <div className="mt-6 pt-4 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
            Sources
          </div>
          <ul className="text-sm space-y-2">
            {Array.from(new Set(cluster.articles.map((a) => a.source))).map((s) => (
              <li key={s} className="flex justify-between">
                <span className="text-foreground">{s}</span>
                <span className="text-muted-foreground">
                  {cluster.articles.filter((a) => a.source === s).length}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h3 className="font-serif text-lg font-bold mb-6">Articles in this cluster</h3>
        
        <div className="space-y-6">
          {cluster.articles.map((a) => (
            <div key={a.id} className="pb-6 border-b border-border/50 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-3 text-xs text-muted-foreground mb-2">
                <span className="font-medium text-foreground">{a.source}</span>
                <span>•</span>
                <span>{fmtTime(a.published_at)}</span>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="block font-serif text-lg leading-snug text-primary hover:underline"
              >
                {a.title}
              </a>
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{a.summary}</p>
              {a.keywords && a.keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.keywords.slice(0, 5).map((k) => (
                    <span
                      key={k}
                      className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
