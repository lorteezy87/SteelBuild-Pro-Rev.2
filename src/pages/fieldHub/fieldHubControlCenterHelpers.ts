export function fmtDate(iso: string | null): string {
  if (!iso || iso === "—") return "—";
  try {
    const [, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m) - 1]} ${Number(d)}`;
  } catch {
    return iso;
  }
}
