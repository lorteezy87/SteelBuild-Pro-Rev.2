import React from "react";
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SearchFilter({ search, onSearchChange, filters = [] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {onSearchChange && (
        <div style={{ position: "relative", flex: "1 1 160px", minWidth: 160 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            style={{
              width: "100%", paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 8, color: "var(--text-primary)",
              fontFamily: "var(--font-body)", fontSize: 12,
              outline: "none", boxSizing: "border-box",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-muted)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--border-default)"; e.target.style.boxShadow = "none"; }}
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      {filters.map((f) => (
        <Select key={f.key} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger style={{
            height: 33, fontSize: 11, width: 148,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8, color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}>
            <SelectValue placeholder={f.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {f.placeholder}s</SelectItem>
            {f.options.map((o) => {
              const val = typeof o === "object" ? o.value : o;
              const label = typeof o === "object" ? o.label : o;
              return <SelectItem key={val} value={val}>{label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}