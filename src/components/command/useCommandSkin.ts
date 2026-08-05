import { useEffect } from "react";

/** Sets [data-skin="command"] on <html> while the calling component is mounted. */
export function useCommandSkin(): void {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-skin");
    root.setAttribute("data-skin", "command");
    return () => {
      if (prev) root.setAttribute("data-skin", prev);
      else root.removeAttribute("data-skin");
    };
  }, []);
}
