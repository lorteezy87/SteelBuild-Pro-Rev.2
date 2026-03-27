import React from 'react';
import { isPending } from '../shared/deckJoistStyles';

export default function DeckJoistPill({ hasDeck, deckStatus, hasJoist, joistStatus }) {
  const pills = [];

  if (hasDeck) {
    const isDeckPending = isPending(deckStatus);
    pills.push(
      <span
        key="deck"
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: 7,
          fontWeight: isDeckPending ? 700 : 400,
          color: isDeckPending ? '#8B0000' : 'rgba(0,214,143,0.50)',
          background: isDeckPending ? 'rgba(139,0,0,0.12)' : 'rgba(0,214,143,0.06)',
          border: isDeckPending
            ? '1px solid rgba(139,0,0,0.28)'
            : '1px solid rgba(0,214,143,0.15)',
          borderRadius: 3,
          padding: '2px 6px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'inline-block',
        }}
      >
        {isDeckPending ? `DECK ▸ ${deckStatus}` : 'DECK ✓'}
      </span>
    );
  }

  if (hasJoist) {
    const isJoistPending = isPending(joistStatus);
    pills.push(
      <span
        key="joist"
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: 7,
          fontWeight: isJoistPending ? 700 : 400,
          color: isJoistPending ? '#8B0000' : 'rgba(0,214,143,0.50)',
          background: isJoistPending ? 'rgba(139,0,0,0.12)' : 'rgba(0,214,143,0.06)',
          border: isJoistPending
            ? '1px solid rgba(139,0,0,0.28)'
            : '1px solid rgba(0,214,143,0.15)',
          borderRadius: 3,
          padding: '2px 6px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'inline-block',
        }}
      >
        {isJoistPending ? `JOIST ▸ ${joistStatus}` : 'JOIST ✓'}
      </span>
    );
  }

  if (pills.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {pills}
    </div>
  );
}