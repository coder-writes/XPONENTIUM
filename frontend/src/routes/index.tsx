import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchTimeline, fetchCluster, triggerIngest, checkIngestStatus, type TimelineCluster, type ClusterDetail } from "../api";
import { Sidebar } from "../components/Sidebar";
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
      <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#0F172A] text-slate-800 dark:text-slate-100 font-sans">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          {/* Header */}
          <Header 
            refreshedAt={refreshedAt} 
            refreshing={refreshing} 
            ingestError={ingestError} 
            onRefresh={handleRefresh} 
          />

          {/* Split Pane Container */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Timeline Pane */}
            <div className="flex-1 overflow-y-auto min-w-0">
              <TimelineView 
                timeline={timeline} 
                selectedId={selectedId} 
                onSelect={setSelectedId} 
                hydrated={hydrated} 
              />
            </div>

            {/* Cluster Detail Pane */}
            {selectedCluster && (
              <div className="w-[420px] shrink-0 border-l border-slate-200 dark:border-slate-800 h-full overflow-hidden">
                <ClusterDetailView 
                  cluster={selectedCluster} 
                  onClose={() => setSelectedCluster(null)} 
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
