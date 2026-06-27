import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/components/shared/formatters';
import {
  getItemStyle,
  isPending,
  getStatusBadgeStyle,
  isOverdue,
} from '../shared/deckJoistStyles';

export default function DeckJoistDashboardCard({ project, onEdit }) {
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    if (!project?.id) return;
    const loadDeliveries = async () => {
      try {
        const dels = await base44.entities.Delivery.filter({
          project_id: project.id,
        });
        setDeliveries(dels || []);
      } catch (err) {
        console.error('Failed to load deliveries:', err);
      }
    };
    loadDeliveries();
  }, [project?.id]);

  if (!project?.hasDeck && !project?.hasJoist) {
    return null;
  }

  const linkedDeckDel = deliveries.find((d) => d.id === project.deckLinkedDeliveryId);
  const linkedJoistDel = deliveries.find((d) => d.id === project.joistLinkedDeliveryId);

  return (
    <div
      style={{
        background: 'var(--bg-surface-low)',
        border: '1px solid var(--divider)',
        borderRadius: 14,
        padding: '20px 24px',
        display: project.hasDeck && project.hasJoist ? 'grid' : 'block',
        gridTemplateColumns: project.hasDeck && project.hasJoist ? '1fr 1fr' : undefined,
        gap: project.hasDeck && project.hasJoist ? 20 : undefined,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: project.hasDeck && project.hasJoist ? -24 : 16,
          paddingBottom: 16,
          borderBottom: '1px solid var(--divider)',
          gridColumn: project.hasDeck && project.hasJoist ? '1 / -1' : undefined,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          DECK & JOIST TRACKING
        </span>
        <button
          onClick={onEdit}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            color: 'var(--accent)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          ✏ Edit
        </button>
      </div>

      {/* Deck Panel */}
      {project.hasDeck && (
        <div style={{ paddingTop: 16 }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 16,
                fontWeight: 700,
                color: isPending(project.deckStatus) ? 'var(--status-error)' : 'var(--status-success)',
              }}
            >
              DECK
            </div>
            <div style={getStatusBadgeStyle(project.deckStatus)}>
              {project.deckStatus}
            </div>
          </div>

          {/* Supplier Block */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Supplier / Fabricator
            </div>
            <div style={{ ...getItemStyle(project.deckStatus), fontSize: 13, marginBottom: 4 }}>
              {project.deckSubcontractor || '— Not set'}
            </div>
            <div style={{ fontSize: 11, ...getItemStyle(project.deckStatus) }}>
              {project.deckContact && project.deckContactEmail
                ? `${project.deckContact} · ${project.deckContactEmail}`
                : project.deckContact || '—'}
            </div>
            {project.deckContactPhone && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  ...getItemStyle(project.deckStatus),
                }}
              >
                {project.deckContactPhone}
              </div>
            )}
          </div>

          {/* Installer Block */}
          <div
            style={{
              paddingTop: 10,
              borderTop: '1px solid var(--divider)',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 6,
                textTransform: 'uppercase',
                }}
                >
                Deck Installer
            </div>
            <div style={{ ...getItemStyle(project.deckStatus), fontSize: 13, marginBottom: 4 }}>
              {project.deckInstallerCompany || '— Not set'}
            </div>
            <div style={{ fontSize: 11, ...getItemStyle(project.deckStatus) }}>
              {project.deckInstallerContact && project.deckInstallerEmail
                ? `${project.deckInstallerContact} · ${project.deckInstallerEmail}`
                : project.deckInstallerContact || '—'}
            </div>
          </div>

          {/* Schedule Block */}
          <div
            style={{
              paddingTop: 10,
              borderTop: '1px solid var(--divider)',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 8,
                textTransform: 'uppercase',
                }}
                >
                Schedule
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DateDisplay
                label="Submittal Due"
                date={project.deckSubmittalDue}
                status={project.deckStatus}
              />
              <DateDisplay
                label="Shop Release"
                date={project.deckShopReleaseDate}
                status={project.deckStatus}
              />
              <DateDisplay
                label="Delivery"
                date={project.deckDeliveryDate}
                status={project.deckStatus}
              />
              <DateDisplay
                label="Install"
                date={project.deckInstallDate}
                status={project.deckStatus}
              />
            </div>
          </div>

          {/* Linked Delivery */}
          {linkedDeckDel && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 8,
              }}
            >
              🔗 Linked: {linkedDeckDel.description || `DEL-${linkedDeckDel.id.slice(0, 8)}`}
            </div>
          )}

          {/* Notes */}
          {project.deckNotes && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                marginTop: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                }}
                >
                {project.deckNotes}
            </div>
          )}
        </div>
      )}

      {/* Joist Panel */}
      {project.hasJoist && (
        <div style={{ paddingTop: project.hasDeck && project.hasJoist ? 0 : 16 }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 16,
                fontWeight: 700,
                color: isPending(project.joistStatus) ? 'var(--status-error)' : 'var(--status-success)',
              }}
            >
              JOIST
            </div>
            <div style={getStatusBadgeStyle(project.joistStatus)}>
              {project.joistStatus}
            </div>
          </div>

          {/* Supplier Block */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Supplier / Fabricator
            </div>
            <div style={{ ...getItemStyle(project.joistStatus), fontSize: 13, marginBottom: 4 }}>
              {project.joistSubcontractor || '— Not set'}
            </div>
            <div style={{ fontSize: 11, ...getItemStyle(project.joistStatus) }}>
              {project.joistContact && project.joistContactEmail
                ? `${project.joistContact} · ${project.joistContactEmail}`
                : project.joistContact || '—'}
            </div>
            {project.joistContactPhone && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  ...getItemStyle(project.joistStatus),
                }}
              >
                {project.joistContactPhone}
              </div>
            )}
          </div>

          {/* Schedule Block */}
          <div
            style={{
              paddingTop: 10,
              borderTop: '1px solid var(--divider)',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                marginBottom: 8,
                textTransform: 'uppercase',
                }}
                >
                Schedule
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DateDisplay
                label="Submittal Due"
                date={project.joistSubmittalDue}
                status={project.joistStatus}
              />
              <DateDisplay
                label="Shop Release"
                date={project.joistShopReleaseDate}
                status={project.joistStatus}
              />
              <DateDisplay
                label="Delivery"
                date={project.joistDeliveryDate}
                status={project.joistStatus}
              />
              <DateDisplay
                label="Install"
                date={project.joistInstallDate}
                status={project.joistStatus}
              />
            </div>
          </div>

          {/* Linked Delivery */}
          {linkedJoistDel && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 8,
              }}
            >
              🔗 Linked: {linkedJoistDel.description || `DEL-${linkedJoistDel.id.slice(0, 8)}`}
            </div>
          )}

          {/* Notes */}
          {project.joistNotes && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                marginTop: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                }}
                >
                {project.joistNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DateDisplay({ label, date, status }) {
  const overdue = isOverdue(date) && isPending(status);
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          marginBottom: 4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: isPending(status) ? 'var(--status-error)' : 'var(--status-success)',
          fontWeight: isPending(status) ? 700 : 400,
          opacity: isPending(status) ? 1 : 0.65,
        }}
      >
        {overdue && '⚠ '}
        {date ? formatDate(date) : '—'}
      </div>
    </div>
  );
}