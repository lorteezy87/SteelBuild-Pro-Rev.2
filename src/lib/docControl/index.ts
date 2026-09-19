/**
 * docControl — Document Control intake for incoming construction documents.
 *
 * The deterministic boundary: title-block extraction, Master Document Register
 * cross-reference, revision change summary, stamp/signature and approval flags,
 * and the database-ready ingestion payload.
 *
 * Import from here, not from the individual modules.
 */

export * from "./types";
export { readTitleBlock, normalizeIssueDate, normalizeRevisionCode, observedField, unobserved, coalesceField } from "./titleBlock";
export type { TitleBlockSource } from "./titleBlock";
export { detectAttestations, detectStamp, detectSignature, attestFromHuman } from "./attestations";
export type { AttestationSource } from "./attestations";
export { crossReferenceRegister, toMdrEntry, normalizeCallouts } from "./mdr";
export type { CrossReferenceInput } from "./mdr";
export { buildChangeSummary } from "./changeSummary";
export type { IncomingSheet } from "./changeSummary";
export { computeDocControlFindings, hasBlocker, isApprovedIssuance } from "./findings";
export type { FindingsInput } from "./findings";
export { buildDocControlRecord } from "./record";
export type { BuildRecordInput } from "./record";
export { buildIntakeRecords, registerFromMatch } from "./intakeFromUpload";
export type { IntakeInput, UploadMatch, UploadNewSheet, UploadOldSheet } from "./intakeFromUpload";
