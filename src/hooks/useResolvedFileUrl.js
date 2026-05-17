import { useEffect, useState } from "react";
import { resolveFileUrl } from "@/api/base44Client";

const cache = new Map();

export function useResolvedFileUrl(fileUrl) {
  const [url, setUrl] = useState(() => (fileUrl && cache.get(fileUrl)) || null);
  const [loading, setLoading] = useState(!url && !!fileUrl);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileUrl) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = cache.get(fileUrl);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolveFileUrl(fileUrl)
      .then((resolved) => {
        if (cancelled) return;
        if (resolved) cache.set(fileUrl, resolved);
        setUrl(resolved || null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return { url, loading, error };
}
