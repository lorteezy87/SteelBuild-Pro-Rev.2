import type { StatusSuggestPatch } from "@/lib/submittalLinkGlue";
import StatusSuggestStrip from "./StatusSuggestStrip";
import { SubmittalDetail } from "./SubmittalDetail";
import type { SubmittalDetailProps } from "./SubmittalDetail";
import { SubmittalVirtualList } from "./components";
import type { SubmittalVirtualListProps } from "./components";

export interface SubmittalDetailSectionProps {
  detail: SubmittalDetailProps;
  statusSuggest: {
    patch: StatusSuggestPatch;
    busy: boolean;
    onDismiss: () => void;
    onApply: (patch: StatusSuggestPatch) => Promise<void>;
  } | null;
}

export function SubmittalListSection(props: SubmittalVirtualListProps) {
  return <SubmittalVirtualList {...props} />;
}

export function SubmittalDetailSection({
  detail,
  statusSuggest,
}: SubmittalDetailSectionProps) {
  return (
    <>
      {statusSuggest && (
        <StatusSuggestStrip
          patch={statusSuggest.patch}
          busy={statusSuggest.busy}
          onDismiss={statusSuggest.onDismiss}
          onApply={statusSuggest.onApply}
        />
      )}
      <SubmittalDetail {...detail} />
    </>
  );
}
