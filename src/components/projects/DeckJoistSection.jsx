import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';



export default function DeckJoistSection({ project, onUpdate }) {
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

  const handleChange = (field, value) => {
    onUpdate({ ...project, [field]: value });
  };

  const handleToggle = (field) => {
    handleChange(field, !project[field]);
  };

  return (
    <div>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 0 10px',
          borderBottom: '1px solid var(--divider)',
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.06em',
          }}
        >
          DECK & JOIST
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
          }}
        >
          SUBCONTRACTOR TRACKING
        </span>
      </div>

      {/* DECK SECTION */}
      <div style={{ marginBottom: 24 }}>
        {/* Deck Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--hover-bg)',
            border: '1px solid var(--divider)',
            borderRadius: 8,
            marginBottom: 12,
            cursor: 'pointer',
          }}
          onClick={() => handleToggle('hasDeck')}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                }}
                >
                Deck on this project?
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              Toggle on to track deck supplier, installer, and schedule
            </div>
          </div>

          <div
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: project.hasDeck
                ? 'var(--accent)'
                : 'var(--border-default)',
              border: project.hasDeck
                ? '1px solid var(--accent-border)'
                : '1px solid var(--border-strong)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: project.hasDeck ? 23 : 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </div>

        {/* Deck Fields */}
        {project.hasDeck && (
          <div style={{ paddingLeft: 8 }}>
            {/* Two-column supplier/installer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {/* Supplier Column */}
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 7,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.12em',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  Deck Supplier / Fabricator
                </div>
                <DeckJoistInput
                  label="Supplier Company"
                  value={project.deckSubcontractor || ''}
                  onChange={(v) => handleChange('deckSubcontractor', v)}
                  required
                />
                <DeckJoistInput
                  label="Contact Name"
                  value={project.deckContact || ''}
                  onChange={(v) => handleChange('deckContact', v)}
                />
                <DeckJoistInput
                  label="Phone"
                  value={project.deckContactPhone || ''}
                  onChange={(v) => handleChange('deckContactPhone', v)}
                />
                <DeckJoistInput
                  label="Email"
                  value={project.deckContactEmail || ''}
                  onChange={(v) => handleChange('deckContactEmail', v)}
                />
              </div>

              {/* Installer Column */}
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 7,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.12em',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  Deck Installer
                </div>
                <DeckJoistInput
                  label="Installer Company"
                  value={project.deckInstallerCompany || ''}
                  onChange={(v) => handleChange('deckInstallerCompany', v)}
                  required
                />
                <DeckJoistInput
                  label="Contact Name"
                  value={project.deckInstallerContact || ''}
                  onChange={(v) => handleChange('deckInstallerContact', v)}
                />
                <DeckJoistInput
                  label="Email"
                  value={project.deckInstallerEmail || ''}
                  onChange={(v) => handleChange('deckInstallerEmail', v)}
                />
              </div>
            </div>

            {/* Dates */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  }}
                  >
                  Deck Schedule
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <DeckJoistDate
                  label="Submittal Due"
                  value={project.deckSubmittalDue || ''}
                  onChange={(v) => handleChange('deckSubmittalDue', v)}
                />
                <DeckJoistDate
                  label="Shop Release"
                  value={project.deckShopReleaseDate || ''}
                  onChange={(v) => handleChange('deckShopReleaseDate', v)}
                />
                <DeckJoistDate
                  label="Delivery"
                  value={project.deckDeliveryDate || ''}
                  onChange={(v) => handleChange('deckDeliveryDate', v)}
                />
                <DeckJoistDate
                  label="Install"
                  value={project.deckInstallDate || ''}
                  onChange={(v) => handleChange('deckInstallDate', v)}
                />
              </div>
            </div>

            {/* Status & Linked Delivery */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                  Deck Status
                </label>
                <select
                  value={project.deckStatus || 'Pending'}
                  onChange={(e) => handleChange('deckStatus', e.target.value)}
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 7,
                    height: 34,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    padding: '0 10px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <option>Pending</option>
                  <option>Ordered</option>
                  <option>Fabricating</option>
                  <option>Delivered</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                  Link Delivery Record
                </label>
                <select
                  value={project.deckLinkedDeliveryId || ''}
                  onChange={(e) => handleChange('deckLinkedDeliveryId', e.target.value)}
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 7,
                    height: 34,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    padding: '0 10px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <option value="">— Not linked —</option>
                  {deliveries.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.description || `DEL-${d.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                Deck Notes
              </label>
              <textarea
                value={project.deckNotes || ''}
                onChange={(e) => handleChange('deckNotes', e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 7,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  padding: '10px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* JOIST SECTION */}
      <div>
        {/* Joist Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--hover-bg)',
            border: '1px solid var(--divider)',
            borderRadius: 8,
            marginBottom: 12,
            cursor: 'pointer',
          }}
          onClick={() => handleToggle('hasJoist')}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                }}
                >
                Joist on this project?
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              Toggle on to track joist supplier and schedule
            </div>
          </div>

          <div
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: project.hasJoist
                ? 'var(--accent)'
                : 'var(--border-default)',
              border: project.hasJoist
                ? '1px solid var(--accent-border)'
                : '1px solid var(--border-strong)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: project.hasJoist ? 23 : 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </div>

        {/* Joist Fields */}
        {project.hasJoist && (
          <div style={{ paddingLeft: 8 }}>
            {/* Supplier */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  }}
                  >
                  Joist Supplier / Fabricator
              </div>
              <DeckJoistInput
                label="Supplier Company"
                value={project.joistSubcontractor || ''}
                onChange={(v) => handleChange('joistSubcontractor', v)}
                required
              />
              <DeckJoistInput
                label="Contact Name"
                value={project.joistContact || ''}
                onChange={(v) => handleChange('joistContact', v)}
              />
              <DeckJoistInput
                label="Phone"
                value={project.joistContactPhone || ''}
                onChange={(v) => handleChange('joistContactPhone', v)}
              />
              <DeckJoistInput
                label="Email"
                value={project.joistContactEmail || ''}
                onChange={(v) => handleChange('joistContactEmail', v)}
              />
            </div>

            {/* Dates */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 7,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  }}
                  >
                  Joist Schedule
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <DeckJoistDate
                  label="Submittal Due"
                  value={project.joistSubmittalDue || ''}
                  onChange={(v) => handleChange('joistSubmittalDue', v)}
                />
                <DeckJoistDate
                  label="Shop Release"
                  value={project.joistShopReleaseDate || ''}
                  onChange={(v) => handleChange('joistShopReleaseDate', v)}
                />
                <DeckJoistDate
                  label="Delivery"
                  value={project.joistDeliveryDate || ''}
                  onChange={(v) => handleChange('joistDeliveryDate', v)}
                />
                <DeckJoistDate
                  label="Install"
                  value={project.joistInstallDate || ''}
                  onChange={(v) => handleChange('joistInstallDate', v)}
                />
              </div>
            </div>

            {/* Status & Linked Delivery */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                  Joist Status
                </label>
                <select
                  value={project.joistStatus || 'Pending'}
                  onChange={(e) => handleChange('joistStatus', e.target.value)}
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 7,
                    height: 34,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    padding: '0 10px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <option>Pending</option>
                  <option>Ordered</option>
                  <option>Fabricating</option>
                  <option>Delivered</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                  Link Delivery Record
                </label>
                <select
                  value={project.joistLinkedDeliveryId || ''}
                  onChange={(e) => handleChange('joistLinkedDeliveryId', e.target.value)}
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 7,
                    height: 34,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    padding: '0 10px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <option value="">— Not linked —</option>
                  {deliveries.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.description || `DEL-${d.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                Joist Notes
              </label>
              <textarea
                value={project.joistNotes || ''}
                onChange={(e) => handleChange('joistNotes', e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 7,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  padding: '10px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeckJoistInput({ label, value, onChange, required }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>
        {label} {required ? '*' : ''}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border-default)',
          borderRadius: 7,
          height: 34,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          padding: '0 10px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function DeckJoistDate({ label, value, onChange }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border-default)',
          borderRadius: 7,
          height: 34,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 10,
          padding: '0 10px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}