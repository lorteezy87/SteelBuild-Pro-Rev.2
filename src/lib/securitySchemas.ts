import { z } from "zod";

const uuidV4ish = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ymdDate = /^\d{4}-\d{2}-\d{2}$/;
/**
 * An optional project date.
 *
 * `null` is the real "no date" value: all three project date columns are
 * nullable, and ProjectFormModal initialises them to null. It was missing here,
 * so creating a project without filling in a date failed validation before it
 * ever reached the server.
 *
 * `""` is accepted but normalised away, because create_project casts
 * `(project_data->>'start_date')::date` with no nullif: an empty string reaches
 * Postgres as `''::date` and raises a raw cast error. Both empty forms collapse
 * to null, which the cast and the column both handle.
 */
const optionalProjectDateSchema = z.union([
  z.string().trim().regex(ymdDate, "Date must be YYYY-MM-DD"),
  z.literal(""),
  z.null(),
]).optional().transform((v) => (v === "" ? null : v));

export const uuidSchema = z.string().regex(uuidV4ish, "Expected UUID");

export const numberSequenceArgsSchema = z.object({
  project_id: uuidSchema,
  record_type: z.string().trim().min(1, "record_type is required"),
});

export const softDeleteProjectArgsSchema = z.object({
  p_project_id: uuidSchema,
});

export const publishRevisionArgsSchema = z.object({
  revisionId: uuidSchema,
  releaseStatus: z.enum([
    "reviewed",
    "released_for_estimate",
    "released_for_shop",
    "released_for_field",
  ]),
});

export const createProjectRecordSchema = z.object({
  org_id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Project name is required"),
  project_number: z.string().trim().min(1, "Project number is required"),
  start_date: optionalProjectDateSchema,
  target_completion_date: optionalProjectDateSchema,
  forecast_completion_date: optionalProjectDateSchema,
}).passthrough();

export const desktopBrowserSessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
  user: z.object({
    id: uuidSchema,
    email: z.string().email(),
  }),
});

const emailAddressSchema = z.string().trim().email("Invalid email address");

const emailAttachmentSchema = z.object({
  filename: z.string().trim().min(1, "Attachment filename is required"),
  content_type: z.string().trim().optional(),
  content_base64: z.string().trim().min(1, "Attachment content is required"),
  size_bytes: z.number().int().nonnegative().optional(),
});

export const sendEmailParamsSchema = z.object({
  project_id: uuidSchema,
  to: z.array(emailAddressSchema).min(1, "At least one recipient is required"),
  cc: z.array(emailAddressSchema).optional(),
  bcc: z.array(emailAddressSchema).optional(),
  subject: z.string().trim().min(1, "Subject is required"),
  body_text: z.string().trim().min(1, "Message body is required"),
  body_html: z.string().trim().optional(),
  reply_to_message_id: uuidSchema.optional(),
  in_reply_to_external_id: z.string().trim().optional().nullable(),
  thread_id: z.string().trim().optional().nullable(),
  from_email: emailAddressSchema.optional(),
  from_name: z.string().trim().optional(),
  attachments: z.array(emailAttachmentSchema).optional(),
}).passthrough();
