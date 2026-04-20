import React, { useState } from 'react';
import GrilldTab from './GrilldTab';
import LiquorlandTab from './LiquorlandTab';

const MONO = '"IBM Plex Mono", monospace';

const VENUES = [
  { id: 'grilld',      label: "Grill'd" },
  { id: 'liquorland',  label: 'Liquorland' },
];

export default function ShopperTab() {
  const [venue, setVenue] = useState('grilld');

  return (
    <div>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', gap: 8, padding: '16px 16px 0',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
      }}>
        {VENUES.map(v => (
          <button key={v.id} onClick={() => setVenue(v.id)}
            style={{
              fontFamily: MONO, fontSize: 11,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', border: 'none',
              background: venue === v.id ? '#1a1a1a' : '#f3f4f6',
              color: venue === v.id ? '#fff' : '#6b7280',
              marginBottom: 12,
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {venue === 'grilld'     && <GrilldTab />}
      {venue === 'liquorland' && <LiquorlandTab />}
    </div>
  );
}
