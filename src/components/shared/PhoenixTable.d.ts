declare module "@/components/shared/PhoenixTable" {
  import type { CSSProperties, ReactNode } from "react";

  export interface PTDProps {
    right?: boolean;
    mono?: boolean;
    accent?: boolean;
    muted?: boolean;
    bold?: boolean;
    children?: ReactNode;
    style?: CSSProperties;
  }

  export function PTD(props: PTDProps): JSX.Element;
  export function PTR(props: Record<string, unknown>): JSX.Element;
  export default function PhoenixTable(props: Record<string, unknown>): JSX.Element;
}

declare module "@/components/shared/PhoenixTable.jsx" {
  export * from "@/components/shared/PhoenixTable";
  export { default } from "@/components/shared/PhoenixTable";
}
