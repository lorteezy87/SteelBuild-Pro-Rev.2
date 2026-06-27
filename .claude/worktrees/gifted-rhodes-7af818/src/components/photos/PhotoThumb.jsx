import React, { useState } from "react";
import { useResolvedFileUrl } from "@/hooks/useResolvedFileUrl";
import { ImageOff } from "lucide-react";

export default function PhotoThumb({
  fileUrl,
  alt = "",
  style = {},
  objectFit = "cover",
  onLoad,
  onError,
}) {
  const { url, loading, error } = useResolvedFileUrl(fileUrl);
  const [imgError, setImgError] = useState(false);

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(110deg, var(--bg-surface-low) 30%, var(--bg-surface) 50%, var(--bg-surface-low) 70%)",
          backgroundSize: "200% 100%",
          animation: "photoShimmer 1.4s ease-in-out infinite",
          ...style,
        }}
      />
    );
  }

  if (error || imgError || !url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-surface-low)",
          color: "var(--text-muted)",
          flexDirection: "column",
          gap: 4,
          ...style,
        }}
      >
        <ImageOff size={20} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Image unavailable
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onLoad={onLoad}
      onError={(e) => {
        setImgError(true);
        onError?.(e);
      }}
      style={{
        width: "100%",
        height: "100%",
        objectFit,
        display: "block",
        ...style,
      }}
    />
  );
}
