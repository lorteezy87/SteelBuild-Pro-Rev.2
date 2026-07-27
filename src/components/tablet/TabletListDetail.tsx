import React from "react";
import { TabletFormSheet } from "./TabletFormSheet";

export function TabletListDetail({
  list,
  detail,
  stack,
  detailTitle = "Details",
  onCloseDetail = () => {},
}: {
  list: React.ReactNode;
  detail: React.ReactNode | null;
  stack: boolean;
  detailTitle?: string;
  onCloseDetail?: () => void;
}): JSX.Element {
  const showStackedDetail = stack && detail !== null;
  const showSplitDetail = !stack && detail !== null;

  return (
    <>
      <div className={`tablet-list-detail${!stack ? " tablet-list-detail--landscape" : ""}`}>
        <section
          className={`tablet-list-detail__list${!stack && detail === null ? " tablet-list-detail__list--full" : ""}`}
        >
          {list}
        </section>
        {showSplitDetail ? <section className="tablet-list-detail__detail">{detail}</section> : null}
      </div>
      {showStackedDetail ? (
        <TabletFormSheet open title={detailTitle} onClose={onCloseDetail}>
          {detail}
        </TabletFormSheet>
      ) : null}
    </>
  );
}
