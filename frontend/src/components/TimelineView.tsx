import React, { useMemo } from "react";
import type { TimelineCluster } from "../api";

interface TimelineViewProps {
  timeline: TimelineCluster[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hydrated: boolean;
}

const fmtRange = (start: Date, end: Date) => {
  const sameDay = start.toDateString() === end.toDateString();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return sameDay
    ? `${start.toLocaleString(undefined, opts)} → ${end.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : `${start.toLocaleString(undefined, opts)} → ${end.toLocaleString(undefined, opts)}`;
};

function assignLanes(items: TimelineCluster[]): number[] {
  const sorted = items
    .map((it, idx) => ({ idx, start: new Date(it.start).getTime(), end: new Date(it.end).getTime() }))
    .sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(items.length).fill(0);
  for (const it of sorted) {
    let placed = false;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] <= it.start) {
        lanes[it.idx] = l;
        laneEnds[l] = it.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes[it.idx] = laneEnds.length;
      laneEnds.push(it.end);
    }
  }
  return lanes;
}

export function TimelineView({ timeline, selectedId, onSelect, hydrated }: TimelineViewProps) {
  const bounds = useMemo(() => {
    if (timeline.length === 0) {
      const now = Date.now();
      return { min: now - 6 * 24 * 3600_000, max: now };
    }
    const min = Math.min(...timeline.map((c) => new Date(c.start).getTime()));
    const max = Math.max(...timeline.map((c) => new Date(c.end).getTime()));
    const pad = (max - min) * 0.04 || 3600_000;
    return { min: min - pad, max: max + pad };
  }, [timeline]);

  const ticks = useMemo(() => {
    const t: number[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) t.push(bounds.min + ((bounds.max - bounds.min) * i) / n);
    return t;
  }, [bounds]);

  const lanes = useMemo(() => assignLanes(timeline), [timeline]);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const pct = (t: number) => ((t - bounds.min) / (bounds.max - bounds.min)) * 100;

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-serif text-2xl font-bold">
          Topic Clusters
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {timeline.length} clusters · {timeline.reduce((s, c) => s + c.article_count, 0)} articles ·{" "}
          {hydrated ? fmtRange(new Date(bounds.min), new Date(bounds.max)) : "loading…"}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm relative">
        {timeline.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No clusters available. Click Refresh to ingest news.
          </div>
        ) : (
          <div className="relative w-full" style={{ height: laneCount * 48 + 24 }}>
            {ticks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-6 w-px bg-border/50 border-r border-dashed border-border/50"
                style={{ left: `${pct(t)}%` }}
              />
            ))}

            {timeline.map((c, i) => {
              const left = pct(new Date(c.start).getTime());
              const right = pct(new Date(c.end).getTime());
              const width = Math.max(right - left, 1.5);
              const lane = lanes[i];
              const isSelected = selectedId === c.cluster_key;
              
              return (
                <button
                  key={c.cluster_key}
                  onClick={() => onSelect(c.cluster_key)}
                  className={[
                    "absolute group flex items-center justify-between rounded px-2 text-left transition-colors",
                    "border text-sm focus:outline-none",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary z-10 font-medium"
                      : "bg-secondary text-secondary-foreground border-border hover:border-primary/50",
                  ].join(" ")}
                  style={{
                    left: `${left}%`,
                    width: `calc(${width}%)`,
                    top: lane * 48 + 4,
                    height: 36,
                  }}
                  title={`${c.label} · ${c.article_count} articles`}
                >
                  <span className="truncate text-xs">
                    {c.label}
                  </span>
                  <span
                    className={[
                      "ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                      isSelected ? "bg-white/20 text-white" : "bg-black/5 text-muted-foreground group-hover:bg-black/10",
                    ].join(" ")}
                  >
                    {c.article_count}
                  </span>
                </button>
              );
            })}

            <div className="absolute left-0 right-0 bottom-0 h-6">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                  style={{ left: `${pct(t)}%`, top: 4 }}
                >
                  {new Date(t).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                  })}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
