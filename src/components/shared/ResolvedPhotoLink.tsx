import { useResolvedFileUrl } from "@/hooks/useResolvedFileUrl";

/** The stored record is untrusted; only the shared resolver may produce href/src. */
export default function ResolvedPhotoLink({ fileUrl, name, size = 80 }: {
  fileUrl?: string | null; name: string; size?: number;
}) {
  const { url, loading } = useResolvedFileUrl(fileUrl);
  const style = {
    display: "block", width: size, height: size, borderRadius: 8,
    border: "1px solid var(--border-default)", overflow: "hidden", background: "var(--bg-input)",
  };
  if (!url) return <span style={style} aria-disabled="true" title={loading ? "Preparing photo…" : "Photo unavailable"}>{name}</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" title={name} style={style}>
    <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      onError={event => { event.currentTarget.style.display = "none"; }} />
  </a>;
}
