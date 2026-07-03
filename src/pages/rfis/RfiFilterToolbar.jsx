/**
 * Classic-branch filter toolbar for the RFIs page: search box, discipline
 * chips, density chips, sequence filter, the Today's-Agenda toggle, and the
 * "N of M" count. Presentational — extracted verbatim from RFIs.jsx.
 */
import { Icon } from "@/components/design-system";
import SequenceFilter from "@/components/shared/SequenceFilter";
import { DISCIPLINES, DENSITY_PRESETS } from "./constants";

export default function RfiFilterToolbar({
  search, onSearch,
  disciplineFilter, onDisciplineChange,
  density, onDensityChange,
  rfis, seqFilter, onSeqFilter,
  agendaOpen, onToggleAgenda, agenda, agendaUrgent,
  filteredCount, totalCount,
}) {
  return (
    <div className="rfi-filter-toolbar">
      <div className="rfi-search-box">
        <div className="rfi-search-icon">
          <Icon name="search" size={13} />
        </div>
        <input
          className="rfi-search-input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search RFI number, title, drawing, question, or answer"
        />
      </div>

      <div className="rfi-filter-group">
        <span className="rfi-filter-label">Discipline</span>
        {DISCIPLINES.map((d) => (
          <button
            key={d}
            type="button"
            className={`rfi-chip${disciplineFilter === d ? " is-active" : ""}`}
            onClick={() => onDisciplineChange(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="rfi-filter-group">
        <span className="rfi-filter-label">Density</span>
        {Object.entries(DENSITY_PRESETS).map(([id, preset]) => (
          <button
            key={id}
            type="button"
            className={`rfi-chip${density === id ? " is-active" : ""}`}
            onClick={() => onDensityChange(id)}
            title={preset.label.toLowerCase()}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <SequenceFilter items={rfis} value={seqFilter} onChange={onSeqFilter} />

      <button
        type="button"
        className={`rfi-agenda-toggle${agendaOpen ? " is-active" : ""}${agendaUrgent > 0 ? " is-urgent" : ""}`}
        onClick={onToggleAgenda}
        title="Today's RFI Agenda — overdue, blocking, due-soon, and awaiting RFIs for the production meeting"
      >
        <span className="rfi-agenda-toggle__icon" aria-hidden="true">⚑</span>
        Today's Agenda
        {agenda.total > 0 ? (
          <span className="rfi-agenda-toggle__count">{agenda.total}</span>
        ) : null}
      </button>

      <span className="rfi-toolbar-count">{filteredCount} of {totalCount}</span>
    </div>
  );
}
