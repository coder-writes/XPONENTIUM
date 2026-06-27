import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchTimeline, fetchCluster, triggerIngest, checkIngestStatus, type TimelineCluster, type ClusterDetail } from "../api";
import { Header } from "../components/Header";
import { TimelineView } from "../components/TimelineView";
import { ClusterDetailView } from "../components/ClusterDetailView";

import { ThemeProvider } from "../components/ThemeProvider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "News Pulse — Topic-clustered news timeline" },
      { name: "description", content: "A visual timeline of news topics, grouped from multiple outlets." },
    ],
  }),
  component: Index,
});

function Index() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [timeline, setTimeline] = useState<TimelineCluster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDetail | null>(null);
  
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());
  const [ingestError, setIngestError] = useState<string | null>(null);

  const loadTimeline = async () => {
    try {
      const data = await fetchTimeline();
      setTimeline(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].cluster_key);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const loadDetail = async () => {
      try {
        const data = await fetchCluster(selectedId);
        if (active) setSelectedCluster(data);
      } catch (err) {
        console.error(err);
      }
    };
    loadDetail();
    return () => { active = false; };
  }, [selectedId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setIngestError(null);
    try {
      const jobId = await triggerIngest();

      // Poll status
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusData = await checkIngestStatus(jobId);

        if (statusData.status === "completed") {
          break;
        } else if (statusData.status === "failed") {
          throw new Error(statusData.message || "Ingestion failed");
        }
      }

      await loadTimeline();
      setRefreshedAt(new Date());
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ThemeProvider defaultTheme="light">
      <div className="min-h-screen bg-background text-foreground font-sans">
        <Header 
          refreshedAt={refreshedAt} 
          refreshing={refreshing} 
          ingestError={ingestError} 
          onRefresh={handleRefresh} 
        />

        <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
          <TimelineView 
            timeline={timeline} 
            selectedId={selectedId} 
            onSelect={setSelectedId} 
            hydrated={hydrated} 
          />
          
          {selectedCluster && (
            <ClusterDetailView cluster={selectedCluster} />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
