/**
 * Shared loading / empty / filter-empty / error chrome for thin register pages.
 * Keeps ID-18 patterns consistent without pulling each page into a control center.
 */
import React from "react";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 24px",
  background: "var(--bg-surface)",
  borderRadius: "var(--radius-card)",
  gap: 16,
};

const titleStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-secondary)",
  margin: 0,
  textAlign: "center",
};

const bodyStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  margin: 0,
  textAlign: "center",
  maxWidth: 320,
};

/**
 * Render loading / error / empty / filter-empty / list for a register body.
 */
export function RegisterFetchBody({
  isLoading,
  isError,
  errorMessage,
  onRetry,
  totalCount,
  filteredCount,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  onEmptyAction,
  onClearFilters,
  children,
  skeletonRows = 5,
}) {
  if (isLoading) {
    return <LoadingSkeleton variant="table" rows={skeletonRows} />;
  }

  if (isError) {
    return (
      <div style={panelStyle}>
        <p style={titleStyle}>Couldn’t load records</p>
        <p style={bodyStyle}>{errorMessage || "Something went wrong. Try again."}</p>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry} style={{ marginTop: 4 }}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (filteredCount === 0) {
    if (totalCount === 0) {
      return (
        <div style={panelStyle}>
          <p style={titleStyle}>{emptyTitle}</p>
          {emptyBody ? <p style={bodyStyle}>{emptyBody}</p> : null}
          {onEmptyAction && emptyActionLabel ? (
            <Button variant="primary" onClick={onEmptyAction} style={{ marginTop: 4 }}>
              {emptyActionLabel}
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div style={{ ...panelStyle, padding: "36px 24px", gap: 12 }}>
        <p style={{ ...titleStyle, fontSize: 12 }}>No records match the current filters</p>
        {onClearFilters ? (
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        ) : null}
      </div>
    );
  }

  return children;
}
