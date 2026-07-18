/**
 * Canonical RFI filter toolbar: search, status and discipline filters, density,
 * sequence, Today's Agenda, export/import/create actions, and the visible-row
 * count. Presentational only; RFIs.jsx owns the data and mutations.
 */
import { Icon } from "@/components/design-system";
import SequenceFilter from "@/components/shared/SequenceFilter";
import { DISCIPLINES, DENSITY_PRESETS } from "./constants";

const STATUS_FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["review", "Under Review"],
  ["incomplete", "Incomplete"],
  ["answered", "Answered"],
  ["closed", "Closed"],
];

export default function RfiFilterToolbar({
  search, onSearch,
  filter = "all", onFilterChange = () => {},
  disciplineFilter, onDisciplineChange,
  density, onDensityChange,
  rfis, seqFilter, onSeqFilter,
  agendaOpen, onToggleAgenda, agenda, agendaUrgent,
  filteredCount, totalCount,
  onClearFilters = () => {},
  onImport, onExport, onCreate,
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
        <span className="rfi-filter-label">Status</span>
        {STATUS_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rfi-chip${filter === value ? " is-active" : ""}`}
            onClick={() => onFilterChange(value)}
          >
            {label}
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
        {agenda?.total > 0 ? (
          <span className="rfi-agenda-toggle__count">{agenda.total}</span>
        ) : null}
      </button>

      <span className="rfi-toolbar-count">{filteredCount} of {totalCount}</span>

      <div className="rfi-filter-actions">
        {onClearFilters ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onClearFilters}>
            Clear
          </button>
        ) : null}
        {onImport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onImport}>
            <Icon name="upload" size={13} /> Import
          </button>
        ) : null}
        {onExport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
            <Icon name="download" size={13} /> Export
          </button>
        ) : null}
        {onCreate ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate}>
            <Icon name="plus" size={13} /> New RFI
          </button>
        ) : null}
      </div>
    </div>
  );
}
