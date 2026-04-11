import React, { useState } from "react";

const CATEGORY_COLORS = {
  Progress: "var(--status-info)",
  Safety: "var(--status-error)",
  Issue: "var(--status-warning)",
  Delivery: "var(--status-success)",
  Punchlist: "var(--accent)",
  Other: "var(--text-muted)",
};

export default function PhotoGallery({ photos = [] }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (photos.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "60px 40px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>📷</div>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No photos yet
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Gallery Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "12px",
        }}
      >
        {photos.map((photo) => (
          <div
            key={photo.id}
            onClick={() => setSelectedPhoto(photo)}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "10px",
              overflow: "hidden",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {/* Thumbnail */}
            <div
              style={{
                width: "100%",
                height: "160px",
                background: `url(${photo.file_url}) center/cover`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            {/* Info */}
            <div style={{ padding: "12px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 6px",
                  background: `${CATEGORY_COLORS[photo.category]}20`,
                  border: `1px solid ${CATEGORY_COLORS[photo.category]}40`,
                  borderRadius: "4px",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "7px",
                    fontWeight: 600,
                    color: CATEGORY_COLORS[photo.category],
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {photo.category}
                </span>
              </div>

              {photo.title && (
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "3px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {photo.title}
                </div>
              )}

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-muted)",
                }}
              >
                {new Date(photo.taken_date).toLocaleDateString()}
              </div>

              {photo.location && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "7px",
                    color: "var(--text-muted)",
                    marginTop: "2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  📍 {photo.location}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPhoto(null);
          }}
        >
          <div
            style={{
              background: "var(--bg-surface-secondary)",
              borderRadius: "12px",
              padding: "16px",
              maxWidth: "800px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedPhoto(null)}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "6px",
                width: "32px",
                height: "32px",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              ×
            </button>

            {/* Image */}
            <img
              src={selectedPhoto.file_url}
              alt={selectedPhoto.title}
              style={{
                width: "100%",
                height: "auto",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            />

            {/* Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    background: `${CATEGORY_COLORS[selectedPhoto.category]}20`,
                    border: `1px solid ${CATEGORY_COLORS[selectedPhoto.category]}40`,
                    borderRadius: "6px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 600,
                      color: CATEGORY_COLORS[selectedPhoto.category],
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {selectedPhoto.category}
                  </span>
                </div>
              </div>

              {selectedPhoto.title && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Title
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {selectedPhoto.title}
                  </div>
                </div>
              )}

              {selectedPhoto.description && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Description
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedPhoto.description}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Date Taken
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {new Date(selectedPhoto.taken_date).toLocaleDateString()}
                  </div>
                </div>

                {selectedPhoto.location && (
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginBottom: "4px",
                      }}
                    >
                      Location
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {selectedPhoto.location}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}