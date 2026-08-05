/** Pure query-key builder for SignoffStampPanel (icons stay local). */

export function signoffQueryKey(
  drawingId: string | null | undefined,
  revId: string | null | undefined,
) {
  return ["signoffs", drawingId, revId] as const;
}
