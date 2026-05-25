import type { ComponentType, PropsWithChildren } from "react";
import {
  Dialog as DialogRaw,
  DialogContent as DialogContentRaw,
  DialogHeader as DialogHeaderRaw,
  DialogTitle as DialogTitleRaw,
  DialogFooter as DialogFooterRaw,
} from "@/components/ui/dialog";
import { Input as InputRaw } from "@/components/ui/input";
import { Label as LabelRaw } from "@/components/ui/label";
import {
  Select as SelectRaw,
  SelectContent as SelectContentRaw,
  SelectItem as SelectItemRaw,
  SelectTrigger as SelectTriggerRaw,
  SelectValue as SelectValueRaw,
} from "@/components/ui/select";

// The shadcn ui primitives are still .jsx forwardRef components, so TS
// infers their props as ref-only and rejects className/value/children.
// Re-export them cast to permissive components for .tsx callers — these
// casts are removable once the ui/* primitives are themselves typed.
type AnyProps = PropsWithChildren<Record<string, any>>;

export const Dialog = DialogRaw as unknown as ComponentType<AnyProps>;
export const DialogContent = DialogContentRaw as unknown as ComponentType<AnyProps>;
export const DialogHeader = DialogHeaderRaw as unknown as ComponentType<AnyProps>;
export const DialogTitle = DialogTitleRaw as unknown as ComponentType<AnyProps>;
export const DialogFooter = DialogFooterRaw as unknown as ComponentType<AnyProps>;
export const Input = InputRaw as unknown as ComponentType<AnyProps>;
export const Label = LabelRaw as unknown as ComponentType<AnyProps>;
export const Select = SelectRaw as unknown as ComponentType<AnyProps>;
export const SelectContent = SelectContentRaw as unknown as ComponentType<AnyProps>;
export const SelectItem = SelectItemRaw as unknown as ComponentType<AnyProps>;
export const SelectTrigger = SelectTriggerRaw as unknown as ComponentType<AnyProps>;
export const SelectValue = SelectValueRaw as unknown as ComponentType<AnyProps>;
