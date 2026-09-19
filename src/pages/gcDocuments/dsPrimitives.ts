/**
 * Boundary casts for the design-system primitives this page uses.
 *
 * Button / KpiTile / CommandBar / Modal / EmptyState are still .jsx, so their
 * destructured props are inferred as REQUIRED when consumed from .tsx — every
 * call site would otherwise have to pass `icon`, `title`, `style`, `aria-label`
 * and friends explicitly. Same cast the rest of the app uses (see
 * src/pages/WorkPackages.tsx and src/pages/schedule/PhaseKpiTiles.tsx);
 * collected here so this page states it once, and so it is one edit to delete
 * when those components get typed.
 */

import type { ComponentType, PropsWithChildren } from "react";
import {
  Button as ButtonRaw,
  CommandBar as CommandBarRaw,
  EmptyState as EmptyStateRaw,
  KpiTile as KpiTileRaw,
  Modal as ModalRaw,
} from "@/components/design-system";

type AnyProps = PropsWithChildren<Record<string, unknown>>;

export const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
export const CommandBar = CommandBarRaw as unknown as ComponentType<AnyProps>;
export const EmptyState = EmptyStateRaw as unknown as ComponentType<AnyProps>;
export const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
export const Modal = ModalRaw as unknown as ComponentType<AnyProps>;
