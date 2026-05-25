import type { LucideIcon } from "lucide-react";

export interface EmailMessage {
  id: string;
  subject?: string;
  sender_name?: string;
  sender_email?: string;
  recipients?: any;
  body_text?: string;
  body_html?: string;
  received_at?: string;
  direction?: string;
  parsed_type?: string;
  parsed_metadata?: any;
  parsed_confidence?: number;
  import_status?: string;
  is_read?: boolean;
  is_starred?: boolean;
  has_attachments?: boolean;
  attachment_count?: number;
  labels?: any;
  linked_entity_type?: string | null;
  linked_entity_id?: string | null;
  [key: string]: any;
}

export interface EmailAttachment {
  id: string;
  message_id?: string;
  filename?: string;
  size_bytes?: number;
  content_type?: string;
  storage_path?: string;
  [key: string]: any;
}

export interface OutboundAttachment {
  filename: string;
  content_type: string;
  size_bytes: number;
  content_base64: string;
}

export interface Folder {
  id: string;
  label: string;
  icon: LucideIcon;
  filter: (m: EmailMessage) => boolean;
}

export interface TypeStyle {
  color: string;
  label: string;
}

export interface StatusStyle {
  color: string;
  bg: string;
  border: string;
  label: string;
}

export interface EntityTypeOption {
  value: string;
  label: string;
}

export type ReplyMode = "reply" | "reply_all";
