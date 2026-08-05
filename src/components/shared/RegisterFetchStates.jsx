/**
 * Shared loading / empty / filter-empty / error chrome for thin register pages.
 * Keeps ID-18 patterns consistent without pulling each page into a control center.
 */
import React from "react";
import {
  REGISTER_FETCH_PANEL_STYLE as panelStyle,
  REGISTER_FETCH_TITLE_STYLE as titleStyle,
  REGISTER_FETCH_BODY_STYLE as bodyStyle,
} from "./registerFetchStatesHelpers";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";

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
