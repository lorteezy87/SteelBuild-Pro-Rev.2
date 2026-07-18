/**
 * routes.js — backward-compat re-export shim.
 *
 * Page-registry source of truth moved to src/config/routes.js, which now
 * holds component imports, labels, and project-scoped flags in one place.
 * Existing call sites that imported from `@/routes` keep working unchanged
 * via the re-exports below.
 *
 * New code should import from `@/config/routes` directly.
 */

export {
  ROUTE_LIFECYCLES,
  PAGE_LABELS,
  PAGE_LIFECYCLES,
  PROJECT_SCOPED_PAGES,
  ALL_ROUTE_PATHS,
  STATIC_ROUTE_METADATA,
  routeLabel,
} from "@/config/routes";
