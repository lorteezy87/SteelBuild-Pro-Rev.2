// Shared wizard constants for the DrawingSetUploadModal step components.
//
// Extracted verbatim from DrawingSetUploadModal.jsx so the step sub-components
// (StepMeta, StepReview) can import them without a circular dependency back to
// the modal. Behavior is identical — same discipline list, same canonical
// 7-stage flow (Not Started → IFA → OFA → BFA → OFS → IFC → Released).

import { STAGE_ORDER as CANONICAL_STAGE_ORDER } from "@/components/drawings/drawingsConfig";

export const DISCIPLINES = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];
// Canonical 7-stage flow (Not Started → IFA → OFA → BFA → OFS → IFC → Released)
export const STAGES = CANONICAL_STAGE_ORDER;
