import { PRODUCTION_STAGES } from "./productionStatusControlCenter.derive";

/** Pure chrome for ProductionStatusControlCenter. */

export const STAGE_FILTERS = ["All", ...PRODUCTION_STAGES] as const;
