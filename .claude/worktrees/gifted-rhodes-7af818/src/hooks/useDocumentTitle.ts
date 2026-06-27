import { useEffect } from "react";

/**
 * useDocumentTitle — sets `document.title` for the duration of the component
 * that calls it, restoring the previous title on unmount. The base suffix is
 * appended automatically so tab labels stay branded ("Drawings · SteelBuild Pro").
 *
 * Pass `null`/`undefined` to skip updating (useful when a title isn't ready yet).
 */
const BASE_TITLE = "SteelBuild Pro";

export default function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title == null) return;
    const previous = document.title;
    const next = String(title).trim();
    document.title = next ? `${next} · ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = previous; };
  }, [title]);
}

export { BASE_TITLE };
