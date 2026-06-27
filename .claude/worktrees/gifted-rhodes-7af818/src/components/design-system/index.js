/**
 * Design-system barrel export.
 *
 * Use named imports like:
 *   import { KpiTile, PhaseChevron, StatusPill } from "@/components/design-system";
 *
 * Every component in this folder is lockstep with the tokens defined
 * in `src/styles/tokens.css`. When adding new components, add them
 * here so consumers don't need to know individual file paths.
 */

export { default as Icon, StageIcon, DeliveryStatusIcon } from "./Icon";
export { default as PhaseIcon }      from "./PhaseIcon";
export { default as Button }         from "./Button";
export { default as StatusPill }     from "./StatusPill";
export { default as BicPill }        from "./BicPill";
export { default as Modal }          from "./Modal";
export { default as KpiTile }        from "./KpiTile";
export { default as PhaseChevron }   from "./PhaseChevron";
export { default as ProgressBar }    from "./ProgressBar";
export { default as Sparkline }      from "./Sparkline";
export { default as CommandBar }     from "./CommandBar";
export { default as EmptyState }     from "./EmptyState";
export { default as BulkActionBar }  from "./BulkActionBar";

export * from "./tokens";
