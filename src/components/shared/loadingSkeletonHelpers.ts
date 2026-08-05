/**
 * Pure shimmer chrome for LoadingSkeleton variants.
 */

export const SKELETON_SHIMMER_STYLE: Record<string, string | number> = {
  background:
    "linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-high) 50%, var(--bg-surface) 75%)",
  backgroundSize: "800px 100%",
  animation: "skeleton-shimmer 1.6s ease-in-out infinite",
  borderRadius: 8,
};
