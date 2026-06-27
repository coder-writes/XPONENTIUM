export type TimelineCluster = {
  cluster_key: string;
  label: string;
  start: string;
  end: string;
  article_count: number;
  duration_hours: number;
  intensity: number;
};

export type ClusterDetail = {
  id: number;
  cluster_key: string;
  label: string;
  article_count: number;
  created_at: string;
  articles: Array<{
    id: number;
    source: string;
    title: string;
    summary: string;
    url: string;
    published_at: string;
    keywords: string[];
  }>;
};

export async function fetchTimeline(): Promise<TimelineCluster[]> {
  const res = await fetch("/api/timeline");
  if (!res.ok) throw new Error("Failed to fetch timeline");
  const data = await res.json();
  return data.clusters || [];
}

export async function fetchCluster(id: string): Promise<ClusterDetail> {
  const res = await fetch(`/api/clusters/${id}`);
  if (!res.ok) throw new Error("Failed to fetch cluster detail");
  return await res.json();
}

export async function triggerIngest(): Promise<string> {
  const res = await fetch("/api/ingest/trigger", { method: "POST" });
  if (!res.ok) throw new Error("Failed to trigger ingestion");
  const data = await res.json();
  return data.jobId;
}

export async function checkIngestStatus(jobId: string): Promise<any> {
  const res = await fetch(`/api/ingest/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to check status");
  return await res.json();
}
