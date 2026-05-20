import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Settings } from 'lucide-react';
import { CLAY, FS, FW, MONO } from './theme';
import { SHELL_HEADING_STYLE } from './appConstants';
import { useIsWide } from './hooks';
import { UI } from './ui';

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 13, height: 13, verticalAlign: 'middle',
      border: `2px solid rgba(255,255,255,0.35)`, borderTopColor: '#fff',
      borderRadius: '50%', animation: 'travel-spin 0.65s linear infinite',
    }} />
  );
}

const S = {
  card: {
    background: CLAY.surface, borderRadius: UI.cardRadius, padding: '16px 18px',
    boxShadow: CLAY.shadow,
  },
  label:   { fontSize: FS.lg,      fontFamily: MONO, fontWeight: FW.semibold, color: CLAY.text },
  caption: { fontSize: FS.compact, fontFamily: MONO, color: CLAY.textLt, letterSpacing: '0.06em' },
  mid:     { fontSize: FS.compact, fontFamily: MONO, color: CLAY.textMid },
};

const inputSt = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px',
  borderRadius: UI.controlRadius, border: 'none',
  fontFamily: MONO, fontSize: FS.lg, outline: 'none', background: CLAY.surf2, color: CLAY.text,
};

const PLACE_TYPES = [
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { id: 'cafe', label: 'Cafe', icon: '☕' },
  { id: 'shop', label: 'Shop', icon: '🛍️' },
  { id: 'sightseeing', label: 'Sightseeing', icon: '🏛️' },
  { id: 'activity', label: 'Activity', icon: '🎟️' },
  { id: 'transport', label: 'Transport', icon: '🚕' },
  { id: 'other', label: 'Other', icon: '📍' },
];

function slugifyPlaceType(label = '') {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
}

function placeTypeMeta(id, customLabel) {
  const builtIn = PLACE_TYPES.find(t => t.id === id);
  if (builtIn) return builtIn;
  if (customLabel) return { id: id || slugifyPlaceType(customLabel), label: customLabel, icon: '📍' };
  return PLACE_TYPES[PLACE_TYPES.length - 1];
}

function inferPlaceType(text = '') {
  const t = text.toLowerCase();
  if (/\b(restaurant|ramen|sushi|dinner|lunch|breakfast|bar|izakaya|food)\b/.test(t)) return 'restaurant';
  if (/\b(cafe|coffee|tea|bakery)\b/.test(t)) return 'cafe';
  if (/\b(shop|mall|market|store|outlet)\b/.test(t)) return 'shop';
  if (/\b(temple|shrine|museum|castle|park|tower|garden|sight|landmark)\b/.test(t)) return 'sightseeing';
  if (/\b(train|taxi|bus|station|transport|transfer)\b/.test(t)) return 'transport';
  if (/\b(ticket|tour|show|activity|class|experience)\b/.test(t)) return 'activity';
  return 'other';
}

// ── helpers ───────────────────────────────────────────────────────────────────

function nightsBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}
function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}
function shortLabel(str) {
  if (!str) return '?';
  return str.replace(/^(Hotel|Apartment Hotel|Apartment|Hostel)\s+/i, '')
    .split(/\s+/).slice(0, 2).join(' ');
}

function bookingEndLocation(b, forMaps = false) {
  if (!b) return '';
  if (b.type === 'flight') {
    const d = b.details || {};
    const code = d.dest_code || '', city = d.dest || d.destination || '';
    if (forMaps && code) return `${code} Airport${city ? ', ' + city : ''}`;
    return city || code;
  }
  if (forMaps) return [b.title, b.city, b.country].filter(Boolean).join(', ');
  return [b.city, b.country].filter(Boolean).join(', ') || '';
}
function bookingStartLocation(b, forMaps = false) {
  if (!b) return '';
  if (b.type === 'flight') {
    const d = b.details || {};
    const code = d.origin_code || '', city = d.origin || '';
    if (forMaps && code) return `${code} Airport${city ? ', ' + city : ''}`;
    return city || code;
  }
  if (forMaps) return [b.title, b.city, b.country].filter(Boolean).join(', ');
  return [b.city, b.country].filter(Boolean).join(', ') || '';
}
function bookingLocation(b) { return bookingEndLocation(b, false); }

const WEATHER_CODE_LABELS = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Showers',
  81: 'Showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Storm',
  99: 'Storm',
};

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if (code >= 51 && code <= 82) return '🌧️';
  if (code >= 71 && code <= 75) return '❄️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

function pickWeatherLocation(items, todayStr) {
  const dated = [...(items || [])]
    .filter(b => b.start_date || b.end_date || b.visibleUntilDate)
    .sort((a, b) => String(a.start_date || a.end_date || '').localeCompare(String(b.start_date || b.end_date || '')));
  const candidates = [
    ...dated.filter(b => (b.visibleUntilDate || b.end_date || b.start_date) >= todayStr),
    ...dated,
  ];
  for (const item of candidates) {
    const city = item.type === 'flight'
      ? (item.details?.dest || item.details?.destination || '')
      : (item.city || '');
    const country = item.country || '';
    const label = [city, country].filter(Boolean).join(', ');
    if (city) return { query: label || city, label: city };
  }
  return null;
}

function locationMapUrl(b) {
  if (!b) return null;
  let loc;
  if (b.type === 'flight') {
    const d = b.details || {};
    const code = d.dest_code || '', city = d.dest || d.destination || '';
    loc = code ? `${code} Airport${city ? ', ' + city : ''}` : city;
  } else if (b.type === 'note') {
    loc = [b.title, b.city, b.country].filter(Boolean).join(', ');
  } else {
    loc = [b.title, b.city, b.country].filter(Boolean).join(', ');
  }
  if (!loc) return null;
  return `https://www.google.com/maps/search/${encodeURIComponent(loc)}`;
}

function directionsUrl(from, to) {
  const f = bookingEndLocation(from, true);
  const t = bookingStartLocation(to, true);
  if (!f || !t) return null;
  return `https://www.google.com/maps/dir/${encodeURIComponent(f)}/${encodeURIComponent(t)}`;
}

async function callGemini(apiKey, model, prompt, timeoutMs = 60000) {
  const m = model || 'gemini-2.0-flash';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 60s. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGeminiVision(apiKey, model, imageBase64, mimeType, prompt, timeoutMs = 60000) {
  const m = model || 'gemini-2.0-flash';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt },
          ]}],
        }),
      }
    );
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function btnStyle(disabled, color) {
  return {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #e8e8e8',
    background: disabled ? '#f9f9f9' : '#fff',
    color: disabled ? '#ccc' : (color || CLAY.textMid),
    fontFamily: MONO, fontSize: 13, cursor: disabled ? 'default' : 'pointer',
    lineHeight: 1, flexShrink: 0,
  };
}

// Expand hotels into checkin + checkout for the timeline
function expandForTimeline(tripItems) {
  const expanded = [];
  tripItems.forEach((b, origIdx) => {
    if (b.type === 'hotel' && b.end_date && b.end_date !== b.start_date) {
      expanded.push({ ...b, _view: 'checkin',  _viewDate: b.start_date, _origIdx: origIdx, _subIdx: origIdx * 2 });
      expanded.push({ ...b, _view: 'checkout', _viewDate: b.end_date,   _origIdx: origIdx, _subIdx: origIdx * 2 + 1 });
    } else {
      expanded.push({ ...b, _view: b.type || 'note', _viewDate: b.start_date, _origIdx: origIdx, _subIdx: origIdx * 2 });
    }
  });
  return expanded.sort((a, b) => {
    if (a._viewDate !== b._viewDate) return a._viewDate.localeCompare(b._viewDate);
    return a._subIdx - b._subIdx;
  });
}

function annotateTravelStayContext(items) {
  const sorted = [...items].sort((a, b) => (
    Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
    String(a.start_date || '').localeCompare(String(b.start_date || ''))
  ));
  let activeHotel = null;
  const contextById = new Map();
  for (const item of sorted) {
    if (item.type === 'hotel') {
      activeHotel = item;
      contextById.set(item.id, { visibleUntilDate: item.end_date || item.start_date || null });
      continue;
    }
    if (item.type === 'note' && activeHotel?.end_date) {
      contextById.set(item.id, {
        stayHotelId: activeHotel.id,
        stayHotelTitle: activeHotel.title,
        visibleUntilDate: activeHotel.end_date,
      });
    }
  }
  return items.map(item => ({ ...item, ...(contextById.get(item.id) || {}) }));
}

// Journey points for the map (in travel order)
function getJourneyPoints(bookings) {
  const points = [];
  for (const b of bookings) {
    if (b.type === 'flight') {
      const d = b.details || {};
      const oc = d.origin_code || '', ocCity = d.origin || '';
      const dc = d.dest_code   || '', dcCity = d.dest || d.destination || '';
      if (oc || ocCity) points.push({ loc: oc ? `${oc} Airport, ${ocCity}` : ocCity, label: oc || ocCity.slice(0,6), mapType: 'airport' });
      if (dc || dcCity) points.push({ loc: dc ? `${dc} Airport, ${dcCity}` : dcCity, label: dc || dcCity.slice(0,6), mapType: 'airport' });
    } else if (b.type === 'hotel') {
      const loc = [b.title, b.city, b.country].filter(Boolean).join(', ');
      if (loc) points.push({ loc, label: shortLabel(b.title), mapType: 'hotel' });
    } else if (b.type === 'note' && (b.city || b.country)) {
      points.push({ loc: [b.city, b.country].filter(Boolean).join(', '), label: shortLabel(b.title || b.city), mapType: 'note' });
    }
  }
  return points;
}

async function geocodeLocation(loc) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    if (d[0]) return [parseFloat(d[0].lat), parseFloat(d[0].lon)];
  } catch {}
  return null;
}

// ── Map components ────────────────────────────────────────────────────────────

function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (!coords.length) return;
    if (coords.length === 1) { map.setView(coords[0], 12); return; }
    try { map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 14 }); } catch {}
  }, [coords.map(c => c.join()).join('|')]);
  return null;
}

function markerIcon(label, mapType) {
  const bg = mapType === 'airport' ? CLAY.blueDk : mapType === 'hotel' ? CLAY.green : CLAY.textMid;
  const html = `<div style="background:#fff;border:2px solid ${bg};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;font-family:sans-serif;color:${bg};box-shadow:0 2px 6px rgba(0,0,0,0.18);transform:translate(-50%,-115%)">${label}</div>`;
  return L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function TravelMap({ bookings }) {
  const journeyPoints = useMemo(() => getJourneyPoints(bookings), [bookings]);
  const uniqueMarkers = useMemo(() => {
    const seen = new Set();
    return journeyPoints.filter(p => { if (seen.has(p.loc)) return false; seen.add(p.loc); return true; });
  }, [journeyPoints]);

  const [coords, setCoords] = useState({});

  useEffect(() => {
    if (!uniqueMarkers.length) return;
    const todo = uniqueMarkers.filter(m => !coords[m.loc]);
    if (!todo.length) return;
    let i = 0;
    const next = async () => {
      if (i >= todo.length) return;
      const m = todo[i++];
      const pos = await geocodeLocation(m.loc);
      if (pos) setCoords(prev => ({ ...prev, [m.loc]: pos }));
      setTimeout(next, 1200);
    };
    next();
  }, [uniqueMarkers.map(m => m.loc).join('|')]);

  const resolvedMarkers = uniqueMarkers.filter(m => coords[m.loc]).map(m => ({ ...m, pos: coords[m.loc] }));
  const polyline = journeyPoints.filter(p => coords[p.loc]).map(p => coords[p.loc]);
  const allCoords = resolvedMarkers.map(m => m.pos);

  return (
    <div style={{ height: 220, borderRadius: 14, overflow: 'hidden', border: '1.5px solid #e8e8e8', marginBottom: 20, background: '#e8e8e8' }}>
      <MapContainer center={[-25, 133]} zoom={3} style={{ height: '100%', width: '100%' }} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {polyline.length >= 2 && (
          <Polyline positions={polyline} pathOptions={{ color: CLAY.blueDk, weight: 2.5, opacity: 0.55, dashArray: '6 8' }} />
        )}
        {resolvedMarkers.map(m => (
          <Marker key={m.loc} position={m.pos} icon={markerIcon(m.label, m.mapType)} />
        ))}
        <FitBounds coords={allCoords} />
      </MapContainer>
    </div>
  );
}

// ── UI components ─────────────────────────────────────────────────────────────

function DateDivider({ date }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
      <span style={{ fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, color: CLAY.textMid, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        📅 {fmtDate(date)}
      </span>
      <div style={{ flex: 1, height: 1, background: '#e4e4e4' }} />
    </div>
  );
}

function EditForm({ b, sb, onUpdate, onCancel, apiKey, model }) {
  const isHotel = b.type === 'hotel', isFlight = b.type === 'flight';
  const [title,     setTitle]     = useState(b.title || '');
  const [location,  setLocation]  = useState([b.city, b.country].filter(Boolean).join(', '));
  const [startDate, setStartDate] = useState(b.start_date || '');
  const [endDate,   setEndDate]   = useState(b.end_date   || '');
  const [notes,     setNotes]     = useState(b.details?.notes || '');
  const [saving,    setSaving]    = useState(false);
  const [detecting, setDetecting] = useState(false);

  const grokDetect = async (field) => {
    if (!apiKey || detecting) return;
    setDetecting(true);
    try {
      const ctx = [title && `Title: ${title}`, notes && `Notes: ${notes}`, b.details?.content && `Content: ${b.details.content}`].filter(Boolean).join('\n');
      if (field === 'location') {
        const reply = await callGemini(apiKey, model, `Based on the following travel item, return ONLY the specific location as "Place Name, City, Country" or "Airport Code Airport, City". No other text.\n\n${ctx}`);
        setLocation(reply.trim().replace(/^["']|["']$/g, ''));
      } else {
        const reply = await callGemini(apiKey, model, `Based on the following travel item, suggest a short title (5 words max). Return ONLY the title.\n\n${ctx}`);
        setTitle(reply.trim().replace(/^["']|["']$/g, ''));
      }
    } catch (err) { alert('Grok: ' + err.message); }
    setDetecting(false);
  };

  const save = async () => {
    setSaving(true);
    const loc = location.trim(), ci = loc.indexOf(',');
    const city = ci >= 0 ? loc.slice(0, ci).trim() : loc;
    const country = ci >= 0 ? loc.slice(ci + 1).trim() : '';
    const patch = {
      title: title.trim() || b.title,
      city, country,
      start_date: startDate || b.start_date,
      end_date:   endDate   || b.end_date,
      details: { ...(b.details || {}), notes: notes.trim() || undefined },
    };
    const { error } = await sb.from('travel_bookings').update(patch).eq('id', b.id);
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    onUpdate({ ...b, ...patch });
  };

  const grokBtn = (field) => (
    <button onClick={() => grokDetect(field)} disabled={!apiKey || detecting} title="Ask Grok" style={{
      padding: '0 10px', height: '100%', borderRadius: '0 7px 7px 0',
      border: '1.5px solid #d8e0eb', borderLeft: 'none',
      background: !apiKey || detecting ? '#f5f5f5' : '#f0f4ff',
      color: !apiKey || detecting ? CLAY.textLt : CLAY.blueDk,
      fontFamily: MONO, fontSize: FS.compact,
      cursor: !apiKey || detecting ? 'default' : 'pointer', flexShrink: 0,
    }}>{detecting ? '…' : '✨'}</button>
  );

  return (
    <div style={{ marginTop: 10, borderTop: '1.5px solid #eef0f4', paddingTop: 12 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <div style={{ ...S.caption, marginBottom: 3 }}>TITLE</div>
          <div style={{ display: 'flex' }}>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputSt, borderRadius: '8px 0 0 8px', flex: 1 }} />
            {grokBtn('title')}
          </div>
        </div>
        <div>
          <div style={{ ...S.caption, marginBottom: 3 }}>LOCATION</div>
          <div style={{ display: 'flex' }}>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Osaka, Japan"
              style={{ ...inputSt, borderRadius: '8px 0 0 8px', flex: 1 }} />
            {grokBtn('location')}
          </div>
        </div>
        {(isHotel || !isFlight) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ ...S.caption, marginBottom: 3 }}>{isHotel ? 'CHECK-IN' : 'START DATE'}</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputSt} />
            </div>
            <div>
              <div style={{ ...S.caption, marginBottom: 3 }}>{isHotel ? 'CHECK-OUT' : 'END DATE'}</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputSt} />
            </div>
          </div>
        )}
        <div>
          <div style={{ ...S.caption, marginBottom: 3 }}>NOTES</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" rows={3}
            style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: saving ? '#e0e0e0' : CLAY.blueDk, color: saving ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function CardActions({ onMoveUp, onMoveDown, onDelete, onEdit, editing, canMoveUp, canMoveDown }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
      <button onClick={onMoveUp}   disabled={!canMoveUp}   style={btnStyle(!canMoveUp)}   title="Move up">↑</button>
      <button onClick={onMoveDown} disabled={!canMoveDown} style={btnStyle(!canMoveDown)} title="Move down">↓</button>
      <button onClick={onDelete}   style={btnStyle(false, '#dc2626')}                     title="Delete">🗑</button>
      <button onClick={onEdit}     style={btnStyle(false, editing ? CLAY.blueDk : CLAY.textMid)} title="Edit">✏️</button>
    </div>
  );
}

function FlightCard({ b, sb, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onUpdate, apiKey, model }) {
  const d = b.details || {};
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ ...S.card, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1.3 }}>✈️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
            <span style={S.label}>{d.flight_number} · {d.airline}</span>
            <span style={S.caption}>{d.cabin}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...S.label, fontSize: FS.heading * 0.85 }}>{d.origin_code}</span>
            <span style={{ color: CLAY.textLt, fontSize: 14 }}>→</span>
            <span style={{ ...S.label, fontSize: FS.heading * 0.85 }}>{d.dest_code}</span>
          </div>
          <div style={{ ...S.mid, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{d.origin} → {d.dest || d.destination}</span>
            {locationMapUrl(b) && <a href={locationMapUrl(b)} target="_blank" rel="noreferrer" style={{ color: CLAY.blueDk, fontSize: FS.compact, textDecoration: 'none', lineHeight: 1 }} title="Open in Google Maps">📍</a>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            <span style={S.mid}>Departs {d.departure_time}</span>
            {d.arrival_time && <span style={S.mid}>Arrives {d.arrival_time}{b.end_date !== b.start_date ? ` (${fmtShortDate(b.end_date)})` : ''}</span>}
          </div>
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {d.seat       && <span style={S.caption}>Seat {d.seat}</span>}
            {d.duration   && <span style={S.caption}>{d.duration}</span>}
            {d.aircraft   && <span style={S.caption}>{d.aircraft}</span>}
            {d.checked_kg && <span style={S.caption}>{d.checked_kg}kg checked</span>}
          </div>
          {b.booking_ref && <div style={{ ...S.caption, marginTop: 4 }}>{b.provider ? b.provider[0].toUpperCase() + b.provider.slice(1) + ' ' : ''}#{b.booking_ref}</div>}
          {b.details?.notes && !editing && <div style={{ ...S.mid, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.details.notes}</div>}
          <CardActions canMoveUp={canMoveUp} canMoveDown={canMoveDown} editing={editing}
            onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} onEdit={() => setEditing(e => !e)} />
          {editing && <EditForm b={b} sb={sb} apiKey={apiKey} model={model} onUpdate={u => { onUpdate(u); setEditing(false); }} onCancel={() => setEditing(false)} />}
        </div>
      </div>
    </div>
  );
}

function HotelCard({ b, sb, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onUpdate, apiKey, model, asCheckin }) {
  const nights = nightsBetween(b.start_date, b.end_date);
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ ...S.card, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1.3 }}>🏨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {asCheckin && <div style={{ ...S.caption, marginBottom: 2 }}>CHECK-IN</div>}
          <div style={S.label}>{b.title}</div>
          {(b.city || b.country) && (
            <div style={{ ...S.mid, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{[b.city, b.country].filter(Boolean).join(', ')}</span>
              {locationMapUrl(b) && <a href={locationMapUrl(b)} target="_blank" rel="noreferrer" style={{ color: CLAY.blueDk, fontSize: FS.compact, textDecoration: 'none', lineHeight: 1 }} title="Open in Google Maps">📍</a>}
            </div>
          )}
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {asCheckin
              ? <span style={S.mid}>{fmtShortDate(b.start_date)}{nights != null ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''}</span>
              : <>
                  <span style={S.mid}>Check-in {fmtShortDate(b.start_date)}</span>
                  <span style={S.mid}>Check-out {fmtShortDate(b.end_date)}</span>
                  {nights != null && <span style={S.caption}>{nights} night{nights !== 1 ? 's' : ''}</span>}
                </>
            }
          </div>
          {b.booking_ref && <div style={{ ...S.caption, marginTop: 4 }}>{b.provider ? b.provider[0].toUpperCase() + b.provider.slice(1) + ' ' : ''}#{b.booking_ref}</div>}
          {b.details?.notes && !editing && <div style={{ ...S.mid, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{b.details.notes}</div>}
          <CardActions canMoveUp={canMoveUp} canMoveDown={canMoveDown} editing={editing}
            onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} onEdit={() => setEditing(e => !e)} />
          {editing && <EditForm b={b} sb={sb} apiKey={apiKey} model={model} onUpdate={u => { onUpdate(u); setEditing(false); }} onCancel={() => setEditing(false)} />}
        </div>
      </div>
    </div>
  );
}

function HotelCheckoutCard({ b }) {
  return (
    <div style={{ ...S.card, marginBottom: 4, background: '#fafcff', border: '1.5px solid #e0eaf8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1.3, opacity: 0.5 }}>🏨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...S.caption, marginBottom: 2 }}>CHECK-OUT</div>
          <div style={{ ...S.label, color: CLAY.textMid }}>{b.title}</div>
          {(b.city || b.country) && (
            <div style={{ ...S.mid, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{[b.city, b.country].filter(Boolean).join(', ')}</span>
              {locationMapUrl(b) && <a href={locationMapUrl(b)} target="_blank" rel="noreferrer" style={{ color: CLAY.blueDk, fontSize: FS.compact, textDecoration: 'none', lineHeight: 1 }} title="Open in Google Maps">📍</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteCard({ b, sb, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(b.details?.content || '');
  const [editingPlaceType, setEditingPlaceType] = useState(b.details?.place_type || 'other');
  const [customPlaceType, setCustomPlaceType] = useState(b.details?.place_type_label || '');
  const [saving, setSaving] = useState(false);
  const placeType = placeTypeMeta(b.details?.place_type, b.details?.place_type_label);

  const saveContent = async () => {
    setSaving(true);
    const customLabel = customPlaceType.trim();
    const newDetails = {
      ...(b.details || {}),
      content,
      place_type: editingPlaceType === 'custom' ? slugifyPlaceType(customLabel) : editingPlaceType,
      place_type_label: editingPlaceType === 'custom' && customLabel ? customLabel : undefined,
    };
    const { error } = await sb.from('travel_bookings').update({ details: newDetails }).eq('id', b.id);
    setSaving(false);
    if (error) { alert('Save failed'); return; }
    onUpdate({ ...b, details: newDetails });
    setEditing(false);
  };

  return (
    <div style={{ ...S.card, marginBottom: 4, border: '1.5px solid #d0e4f8' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 22, lineHeight: 1.3 }}>{placeType.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={S.label}>{b.title}</div>
            <span style={{ ...S.caption, background: CLAY.surf2, borderRadius: 999, padding: '3px 8px', letterSpacing: 0 }}>
              {placeType.label}
            </span>
            {b.stayHotelId && b.visibleUntilDate ? (
              <span style={{ ...S.caption, background: '#eef2ff', color: CLAY.blueDk, borderRadius: 999, padding: '3px 8px', letterSpacing: 0 }}>
                Until checkout {fmtShortDate(b.visibleUntilDate)}
              </span>
            ) : b.start_date && (
              <span style={{ ...S.caption, background: '#eef2ff', color: CLAY.blueDk, borderRadius: 999, padding: '3px 8px', letterSpacing: 0 }}>
                {fmtShortDate(b.start_date)}
              </span>
            )}
          </div>
          {(b.city || b.country) && (
            <div style={{ ...S.mid, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{[b.city, b.country].filter(Boolean).join(', ')}</span>
              {locationMapUrl(b) && <a href={locationMapUrl(b)} target="_blank" rel="noreferrer" style={{ color: CLAY.blueDk, fontSize: FS.compact, textDecoration: 'none', lineHeight: 1 }} title="Open in Google Maps">📍</a>}
            </div>
          )}
          {editing ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...S.caption, marginBottom: 6 }}>PLACE TYPE</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {PLACE_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => setEditingPlaceType(pt.id)} style={{
                    padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${editingPlaceType === pt.id ? CLAY.blueDk : '#d0d8e8'}`,
                    background: editingPlaceType === pt.id ? '#eef2ff' : '#fff',
                    color: editingPlaceType === pt.id ? CLAY.blueDk : CLAY.textMid,
                    fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer',
                  }}>{pt.icon} {pt.label}</button>
                ))}
                <button onClick={() => setEditingPlaceType('custom')} style={{
                  padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${editingPlaceType === 'custom' ? CLAY.blueDk : '#d0d8e8'}`,
                  background: editingPlaceType === 'custom' ? '#eef2ff' : '#fff',
                  color: editingPlaceType === 'custom' ? CLAY.blueDk : CLAY.textMid,
                  fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer',
                }}>＋ Custom</button>
              </div>
              {editingPlaceType === 'custom' && (
                <input value={customPlaceType} onChange={e => setCustomPlaceType(e.target.value)} placeholder="Subtype name, e.g. Museum" style={{ ...inputSt, marginBottom: 8 }} />
              )}
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => { setEditing(false); setContent(b.details?.content || ''); setEditingPlaceType(b.details?.place_type || 'other'); setCustomPlaceType(b.details?.place_type_label || ''); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveContent} disabled={saving} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: saving ? '#e0e0e0' : CLAY.blueDk, color: saving ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          ) : (
            <>
              {content && <div style={{ ...S.mid, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{content}</div>}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={onMoveUp}   disabled={!canMoveUp}   style={btnStyle(!canMoveUp)}   title="Move up">↑</button>
                <button onClick={onMoveDown} disabled={!canMoveDown} style={btnStyle(!canMoveDown)} title="Move down">↓</button>
                <button onClick={onDelete}   style={btnStyle(false, '#dc2626')} title="Delete">🗑</button>
                <button onClick={() => setEditing(true)} style={btnStyle(false, CLAY.blueDk)} title="Edit">✏️</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Connector between hotel checkin and checkout (same hotel stay)
function HotelStayConnector({ b, insertAfterIdx, tripItems, tripName, userId, tripId, apiKey, model, promptTemplate, sb, onInserted }) {
  const nights = nightsBetween(b.start_date, b.end_date);
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, borderTop: '1px dashed #d8d8d8' }} />
        <span style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.textLt, whiteSpace: 'nowrap' }}>
          🏨 {nights} night{nights !== 1 ? 's' : ''} stay
        </span>
        <div style={{ flex: 1, height: 1, borderTop: '1px dashed #d8d8d8' }} />
        <button onClick={() => setAdding(a => !a)} title="Add item here" style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${adding ? CLAY.blueDk : '#d0d8e8'}`, background: adding ? '#deeaf8' : '#fff', color: adding ? CLAY.blueDk : CLAY.textMid, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{adding ? '✕' : '＋'}</button>
      </div>
      {adding && <AddItemForm insertAfterIdx={insertAfterIdx} tripItems={tripItems} tripName={tripName} userId={userId} tripId={tripId} apiKey={apiKey} model={model} promptTemplate={promptTemplate} sb={sb} autoLocation={bookingEndLocation(b, true)} onSave={() => { setAdding(false); onInserted(); }} onCancel={() => setAdding(false)} />}
    </div>
  );
}

// Normal connector between different items
function ItemConnector({ before, after, insertAfterIdx, tripItems, tripName, userId, tripId, apiKey, model, promptTemplate, sb, onInserted }) {
  const [adding, setAdding] = useState(false);
  const url = after ? directionsUrl(before, after) : null;
  const autoLoc = bookingEndLocation(after || before, true);
  return (
    <div style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
        {url && (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, textDecoration: 'none', padding: '3px 10px', borderRadius: 20, border: '1px solid #e0e0e0', background: '#f8f9fa', whiteSpace: 'nowrap' }}>📍 Directions</a>
        )}
        <button onClick={() => setAdding(a => !a)} title="Add item here" style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${adding ? CLAY.blueDk : '#d0d8e8'}`, background: adding ? '#deeaf8' : '#fff', color: adding ? CLAY.blueDk : CLAY.textMid, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{adding ? '✕' : '＋'}</button>
        <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
      </div>
      {adding && <AddItemForm insertAfterIdx={insertAfterIdx} tripItems={tripItems} tripName={tripName} userId={userId} tripId={tripId} apiKey={apiKey} model={model} promptTemplate={promptTemplate} sb={sb} autoLocation={autoLoc} onSave={() => { setAdding(false); onInserted(); }} onCancel={() => setAdding(false)} />}
    </div>
  );
}

// ── Add item form ─────────────────────────────────────────────────────────────

function AddItemForm({ insertAfterIdx, tripItems, tripName, userId, tripId, apiKey, model, promptTemplate, sb, autoLocation, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const ref = tripItems[insertAfterIdx] || tripItems[0];

  const [mode, setMode] = useState(apiKey ? 'ask' : 'manual');

  // ── Ask mode ──
  const [askQ,       setAskQ]       = useState('');
  const [askResults, setAskResults] = useState(null);
  const [askLoading, setAskLoading] = useState(false);
  const [inserting,  setInserting]  = useState(false);
  const [addedSet,   setAddedSet]   = useState(new Set());

  const buildPrompt = (q) => {
    const template = promptTemplate || DEFAULT_PROMPT;
    const locPart  = autoLocation ? ` near ${autoLocation}` : '';
    return template
      .replace('{location}', locPart)
      .replace('{question}', q.trim());
  };

  const askGrokForList = async () => {
    if (!askQ.trim() || askLoading || !apiKey) return;
    setAskLoading(true);
    setAskResults(null);
    try {
      const prompt = buildPrompt(askQ);
      const raw = await callGemini(apiKey, model, prompt);
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) throw new Error('Grok did not return a list. Try rephrasing.');
      setAskResults(JSON.parse(m[0]));
    } catch (err) { alert('Grok: ' + err.message); }
    setAskLoading(false);
  };

  const insertItem = async (idx, it, attach = false) => {
    const refDate = ref?.start_date || today;
    const itemDate = it.date || refDate;
    const inferredType = inferPlaceType([it.title, it.location || it.city, it.notes].filter(Boolean).join(' '));
    const { error } = await sb.from('travel_bookings').insert({
      user_id: userId, trip_id: tripId || null, trip_name: attach ? (tripName || null) : null, type: 'note',
      title: it.title || 'Place',
      city: it.location || it.city || '',
      country: it.country || '',
      start_date: itemDate,
      sort_order: (insertAfterIdx + 1) * 10 - 5 + idx,
      details: { content: it.notes || '', place_type: it.place_type || inferredType },
    });
    if (error) throw error;
  };

  const addOne = async (idx) => {
    if (addedSet.has(idx) || inserting) return;
    setInserting(true);
    try {
      await insertItem(idx, askResults[idx], !!tripName);
      setAddedSet(prev => new Set([...prev, idx]));
    } catch (err) { alert('Save failed: ' + err.message); }
    setInserting(false);
  };

  const insertAll = async () => {
    if (!askResults?.length) return;
    setInserting(true);
    try {
      const remaining = askResults.map((_, i) => i).filter(i => !addedSet.has(i));
      for (const i of remaining) {
        await insertItem(i, askResults[i], !!tripName);
        setAddedSet(prev => new Set([...prev, i]));
      }
      onSave();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
    setInserting(false);
  };

  // ── Maps mode ──
  const [mapsImg,     setMapsImg]     = useState(null); // { preview, base64, mime }
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError,   setMapsError]   = useState('');
  const [mapsName,    setMapsName]    = useState('');
  const [mapsLoc,     setMapsLoc]     = useState('');
  const [mapsCountry, setMapsCountry] = useState('');
  const [mapsNotes,   setMapsNotes]   = useState('');
  const [mapsParsed,  setMapsParsed]  = useState(false);
  const [mapsSaving,  setMapsSaving]  = useState(false);

  const handleMapsFile = (file) => {
    if (!file) return;
    setMapsError('');
    setMapsParsed(false);
    setMapsName(''); setMapsLoc(''); setMapsCountry(''); setMapsNotes('');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const mime = file.type || 'image/jpeg';
      setMapsImg({ preview: dataUrl, base64, mime });
      if (!apiKey) {
        setMapsError('A Gemini API key is required. Set it up in AI Settings.');
        return;
      }
      setMapsLoading(true);
      try {
        const prompt =
          `This is a screenshot from a map app. Extract the place details and return JSON only, no markdown:\n` +
          `{"title":"place name","location":"full street address or specific venue name with city","country":"country","notes":"1-2 sentence description"}\n` +
          `If you cannot determine a field, use an empty string.`;
        const raw = await callGeminiVision(apiKey, model, base64, mime, prompt, 45000);
        const m = raw.match(/\{[\s\S]*?\}/);
        if (!m) throw new Error('Could not read the screenshot. Try a clearer image.');
        const d = JSON.parse(m[0]);
        setMapsName(d.title || '');
        setMapsLoc(d.location || '');
        setMapsCountry(d.country || '');
        setMapsNotes(d.notes || '');
        setMapsParsed(true);
      } catch (err) { setMapsError(err.message); }
      setMapsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const saveMapsItem = async () => {
    if (!mapsName.trim() && !mapsLoc.trim()) return;
    setMapsSaving(true);
    try {
      await Promise.all(tripItems.map((b, i) => sb.from('travel_bookings').update({ sort_order: i * 10 }).eq('id', b.id)));
      const { error } = await sb.from('travel_bookings').insert({
        user_id: userId, trip_id: tripId || null, trip_name: tripName || null, type: 'note',
        title: mapsName.trim() || 'Place',
        city: mapsLoc.trim(), country: mapsCountry.trim(),
        start_date: ref?.start_date || today,
        sort_order: (insertAfterIdx + 1) * 10 - 5,
        details: { content: mapsNotes.trim(), place_type: inferPlaceType([mapsName, mapsLoc, mapsNotes].filter(Boolean).join(' ')) },
      });
      if (error) throw error;
      onSave();
    } catch (err) { alert('Save failed: ' + err.message); }
    setMapsSaving(false);
  };

  // ── Manual mode ──
  const [type,       setType]       = useState('note');
  const [saving,     setSaving]     = useState(false);
  const [title,      setTitle]      = useState('');
  const [location,   setLocation]   = useState(autoLocation || '');
  const [placeType,  setPlaceType]  = useState('sightseeing');
  const [customPlaceType, setCustomPlaceType] = useState('');
  const [notes,      setNotes]      = useState('');
  const [startDate,  setStartDate]  = useState(ref?.start_date || today);
  const [endDate,    setEndDate]    = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [flightNum,  setFlightNum]  = useState('');
  const [airline,    setAirline]    = useState('');
  const [origCode,   setOrigCode]   = useState('');
  const [origCity,   setOrigCity]   = useState('');
  const [destCode,   setDestCode]   = useState('');
  const [destCity,   setDestCity]   = useState('');
  const [departTime, setDepartTime] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  const [cabin,      setCabin]      = useState('');
  const [seat,       setSeat]       = useState('');
  const [flightDate, setFlightDate] = useState(ref?.start_date || today);
  const [arriveDate, setArriveDate] = useState('');

  const save = async () => {
    setSaving(true);
    await Promise.all(tripItems.map((b, i) => sb.from('travel_bookings').update({ sort_order: i * 10 }).eq('id', b.id)));
    const newSortOrder = (insertAfterIdx + 1) * 10 - 5;
    const loc = location.trim(), ci = loc.indexOf(',');
    const city    = ci >= 0 ? loc.slice(0, ci).trim() : loc;
    const country = ci >= 0 ? loc.slice(ci + 1).trim() : '';
    let row;
    if (type === 'hotel') {
      row = { user_id: userId, trip_id: tripId || null, trip_name: tripName || null, type: 'hotel',
        title: title.trim() || 'Hotel', city, country,
        start_date: startDate || today, end_date: endDate || startDate || today,
        booking_ref: bookingRef || null, sort_order: newSortOrder,
        details: { notes: notes.trim() || undefined } };
    } else if (type === 'flight') {
      const flTitle = [flightNum, origCode && destCode ? `${origCode}→${destCode}` : ''].filter(Boolean).join(' ') || title.trim() || 'Flight';
      row = { user_id: userId, trip_id: tripId || null, trip_name: tripName || null, type: 'flight',
        title: flTitle, city: destCity || destCode, country,
        start_date: flightDate || today, end_date: arriveDate || flightDate || today,
        booking_ref: bookingRef || null, sort_order: newSortOrder,
        details: { flight_number: flightNum, airline, origin_code: origCode, origin: origCity, dest_code: destCode, dest: destCity, departure_time: departTime, arrival_time: arriveTime, cabin, seat } };
    } else {
      const customLabel = customPlaceType.trim();
      row = { user_id: userId, trip_id: tripId || null, trip_name: tripName || null, type: 'note',
        title: title.trim() || (loc ? `Place · ${loc}` : 'Place'),
        city, country, start_date: ref?.start_date || today,
        sort_order: newSortOrder,
        details: {
          content: notes.trim(),
          place_type: placeType === 'custom' ? slugifyPlaceType(customLabel) : placeType,
          place_type_label: placeType === 'custom' && customLabel ? customLabel : undefined,
        } };
    }
    const { error } = await sb.from('travel_bookings').insert(row);
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    onSave();
  };

  const canSave = type === 'flight'
    ? (flightNum || origCode || destCode)
    : type === 'hotel'
      ? title.trim()
      : (notes.trim() || title.trim()) && (placeType !== 'custom' || customPlaceType.trim());

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setMode(id)} style={{
      padding: '5px 14px', borderRadius: 6, fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer',
      border: `1.5px solid ${mode === id ? CLAY.blueDk : '#d0d8e8'}`,
      background: mode === id ? '#eef2ff' : '#fff',
      color: mode === id ? CLAY.blueDk : CLAY.textMid,
    }}>{label}</button>
  );

  return (
    <div style={{ background: '#f4f7fb', borderRadius: 12, padding: '14px 16px', border: '1.5px dashed #c0cfe8', margin: '8px 0' }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {apiKey && tabBtn('ask', '✨ Ask Gemini')}
        {tabBtn('maps', '📷 Screenshot')}
        {tabBtn('manual', '✏️ Manual')}
      </div>

      {/* ── Ask mode ── */}
      {mode === 'ask' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={askQ}
              onChange={e => setAskQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && askGrokForList()}
              placeholder="e.g. Best ramen spots in Osaka, things to do in Kyoto on Apr 30…"
              disabled={askLoading}
              style={{ ...inputSt, flex: 1 }}
            />
            <button
              onClick={askGrokForList}
              disabled={askLoading || !askQ.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', flexShrink: 0,
                background: askLoading || !askQ.trim() ? '#e0e0e0' : CLAY.blueDk,
                color: askLoading || !askQ.trim() ? CLAY.textLt : '#fff',
                fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold,
                cursor: askLoading || !askQ.trim() ? 'default' : 'pointer',
                minWidth: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{askLoading ? <Spinner /> : 'Ask'}</button>
          </div>
          {askResults && (() => {
            const remaining = askResults.filter((_, i) => !addedSet.has(i)).length;
            return (
              <div>
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  {askResults.map((it, i) => {
                    const added = addedSet.has(i);
                    return (
                      <div key={i} style={{ background: added ? '#f0faf2' : '#fff', borderRadius: 8, padding: '8px 12px', border: `1px solid ${added ? '#b6e4c0' : '#e4eaf4'}`, display: 'flex', gap: 10, alignItems: 'flex-start', opacity: added ? 0.7 : 1 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, color: CLAY.text }}>{it.title}</div>
                          <div style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, marginTop: 2 }}>
                            {[it.location || it.city, it.country].filter(Boolean).join(', ')}{it.date ? ` · ${fmtShortDate(it.date)}` : ''}
                          </div>
                          {it.notes && <div style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.textLt, marginTop: 4, lineHeight: 1.5 }}>{it.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, marginTop: 2 }}>
                          <button onClick={() => addOne(i)} disabled={added || inserting} style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none',
                            background: added ? CLAY.green : CLAY.blueDk,
                            color: '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold,
                            cursor: added || inserting ? 'default' : 'pointer',
                          }}>{added ? '✓' : '+'}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => addedSet.size > 0 ? onSave() : onCancel()} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Done</button>
                  {remaining > 0 && (
                    <button onClick={insertAll} disabled={inserting} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: inserting ? '#e0e0e0' : CLAY.blueDk, color: inserting ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: inserting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {inserting ? <><Spinner /> Adding…</> : `Add all ${remaining}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {!askResults && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* ── Maps mode ── */}
      {mode === 'maps' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 120, borderRadius: 10, border: `2px dashed ${mapsImg ? CLAY.blueDk : '#c0cfe8'}`,
            background: mapsImg ? '#f4f8ff' : '#fff', cursor: 'pointer', position: 'relative', overflow: 'hidden',
          }}>
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleMapsFile(e.target.files[0])} />
            {mapsImg ? (
              <img src={mapsImg.preview} alt="Map screenshot"
                style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, padding: 6 }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 20 }}>
                <span style={{ fontSize: 32 }}>📸</span>
                <span style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid }}>Tap to upload a map screenshot</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: CLAY.textLt }}>Google Maps, Apple Maps, etc.</span>
              </div>
            )}
            {mapsLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(244,248,255,0.92)', borderRadius: 8 }}>
                <div style={{ width: 22, height: 22, border: `3px solid ${CLAY.blueDk}20`, borderTopColor: CLAY.blueDk, borderRadius: '50%', animation: 'travel-spin 0.65s linear infinite' }} />
                <span style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.blueDk }}>Reading screenshot…</span>
              </div>
            )}
          </label>

          {mapsImg && !mapsLoading && !mapsParsed && (
            <button onClick={() => setMapsImg(null)} style={{ background: 'none', border: 'none', padding: 0, fontFamily: MONO, fontSize: 11, color: CLAY.textLt, cursor: 'pointer', textAlign: 'left' }}>
              ✕ Remove image
            </button>
          )}

          {mapsError && (
            <div style={{ fontFamily: MONO, fontSize: FS.compact, color: CLAY.red, lineHeight: 1.5 }}>{mapsError}</div>
          )}

          {mapsParsed && !mapsLoading && (
            <div style={{ display: 'grid', gap: 8, background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #e4eaf4' }}>
              <div>
                <div style={{ ...S.caption, marginBottom: 3 }}>TITLE</div>
                <input value={mapsName} onChange={e => setMapsName(e.target.value)} style={inputSt} />
              </div>
              <div>
                <div style={{ ...S.caption, marginBottom: 3 }}>LOCATION</div>
                <input value={mapsLoc} onChange={e => setMapsLoc(e.target.value)} placeholder="Street address, City" style={inputSt} />
              </div>
              <div>
                <div style={{ ...S.caption, marginBottom: 3 }}>COUNTRY</div>
                <input value={mapsCountry} onChange={e => setMapsCountry(e.target.value)} style={inputSt} />
              </div>
              {mapsNotes && (
                <div>
                  <div style={{ ...S.caption, marginBottom: 3 }}>NOTES</div>
                  <textarea value={mapsNotes} onChange={e => setMapsNotes(e.target.value)} rows={3}
                    style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              )}
              <button onClick={() => { setMapsImg(null); setMapsParsed(false); }}
                style={{ background: 'none', border: 'none', padding: 0, fontFamily: MONO, fontSize: 11, color: CLAY.textLt, cursor: 'pointer', textAlign: 'left' }}>
                ✕ Use different image
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Cancel</button>
            {mapsParsed && (
              <button onClick={saveMapsItem} disabled={mapsSaving || (!mapsName.trim() && !mapsLoc.trim())}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: mapsSaving ? '#e0e0e0' : CLAY.blueDk, color: mapsSaving ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: mapsSaving ? 'default' : 'pointer' }}>
                {mapsSaving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Manual mode ── */}
      {mode === 'manual' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {[['note', '📍 Place'], ['hotel', '🏨 Hotel'], ['flight', '✈️ Flight']].map(([t, label]) => (
              <button key={t} onClick={() => setType(t)} style={{ padding: '4px 12px', borderRadius: 6, border: `1.5px solid ${type === t ? CLAY.blueDk : '#d0d8e8'}`, background: type === t ? '#eef2ff' : '#fff', color: type === t ? CLAY.blueDk : CLAY.textMid, fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <div style={{ ...S.caption, marginBottom: 3 }}>{type === 'flight' ? 'TITLE / DESCRIPTION' : 'TITLE'}</div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'hotel' ? 'Hotel name' : type === 'flight' ? 'Optional' : 'Place name'} style={inputSt} />
            </div>

            {type === 'note' && (
              <>
                <div>
                  <div style={{ ...S.caption, marginBottom: 6 }}>PLACE TYPE</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PLACE_TYPES.map(pt => (
                      <button key={pt.id} onClick={() => setPlaceType(pt.id)} style={{
                        padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${placeType === pt.id ? CLAY.blueDk : '#d0d8e8'}`,
                        background: placeType === pt.id ? '#eef2ff' : '#fff',
                        color: placeType === pt.id ? CLAY.blueDk : CLAY.textMid,
                        fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer',
                      }}>{pt.icon} {pt.label}</button>
                    ))}
                    <button onClick={() => setPlaceType('custom')} style={{
                      padding: '5px 10px', borderRadius: 999, border: `1.5px solid ${placeType === 'custom' ? CLAY.blueDk : '#d0d8e8'}`,
                      background: placeType === 'custom' ? '#eef2ff' : '#fff',
                      color: placeType === 'custom' ? CLAY.blueDk : CLAY.textMid,
                      fontFamily: MONO, fontSize: FS.compact, cursor: 'pointer',
                    }}>＋ Custom</button>
                  </div>
                </div>
                {placeType === 'custom' && (
                  <div>
                    <div style={{ ...S.caption, marginBottom: 3 }}>CUSTOM SUBTYPE</div>
                    <input value={customPlaceType} onChange={e => setCustomPlaceType(e.target.value)} placeholder="e.g. Museum, Beach, Karaoke" style={inputSt} />
                  </div>
                )}
                <div>
                  <div style={{ ...S.caption, marginBottom: 3 }}>LOCATION</div>
                  <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Osaka, Japan" style={inputSt} />
                </div>
                <div>
                  <div style={{ ...S.caption, marginBottom: 3 }}>NOTES</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Attractions, tips…" rows={4} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              </>
            )}

            {type === 'hotel' && (
              <>
                <div>
                  <div style={{ ...S.caption, marginBottom: 3 }}>LOCATION (City, Country)</div>
                  <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Osaka, Japan" style={inputSt} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>CHECK-IN</div><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>CHECK-OUT</div><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputSt} /></div>
                </div>
                <div><div style={{ ...S.caption, marginBottom: 3 }}>BOOKING REF (optional)</div><input value={bookingRef} onChange={e => setBookingRef(e.target.value)} placeholder="ABC123" style={inputSt} /></div>
                <div><div style={{ ...S.caption, marginBottom: 3 }}>NOTES (optional)</div><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} /></div>
              </>
            )}

            {type === 'flight' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>FLIGHT NO</div><input value={flightNum} onChange={e => setFlightNum(e.target.value)} placeholder="JQ23" style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>AIRLINE</div><input value={airline} onChange={e => setAirline(e.target.value)} placeholder="Jetstar" style={inputSt} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>FROM CODE</div><input value={origCode} onChange={e => setOrigCode(e.target.value.toUpperCase())} placeholder="BNE" style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>TO CODE</div><input value={destCode} onChange={e => setDestCode(e.target.value.toUpperCase())} placeholder="KIX" style={inputSt} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>FROM CITY</div><input value={origCity} onChange={e => setOrigCity(e.target.value)} placeholder="Brisbane" style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>TO CITY</div><input value={destCity} onChange={e => setDestCity(e.target.value)} placeholder="Osaka" style={inputSt} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>DATE</div><input type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>ARRIVAL DATE</div><input type="date" value={arriveDate} onChange={e => setArriveDate(e.target.value)} style={inputSt} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>DEPARTS</div><input value={departTime} onChange={e => setDepartTime(e.target.value)} placeholder="11:40am" style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>ARRIVES</div><input value={arriveTime} onChange={e => setArriveTime(e.target.value)} placeholder="7:45pm" style={inputSt} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>CABIN</div><input value={cabin} onChange={e => setCabin(e.target.value)} placeholder="Economy" style={inputSt} /></div>
                  <div><div style={{ ...S.caption, marginBottom: 3 }}>SEAT</div><input value={seat} onChange={e => setSeat(e.target.value)} placeholder="34E" style={inputSt} /></div>
                </div>
                <div><div style={{ ...S.caption, marginBottom: 3 }}>BOOKING REF (optional)</div><input value={bookingRef} onChange={e => setBookingRef(e.target.value)} placeholder="EQN18N" style={inputSt} /></div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: FS.compact, color: CLAY.textMid, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving || !canSave} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: saving || !canSave ? '#e0e0e0' : CLAY.blueDk, color: saving || !canSave ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: saving || !canSave ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Gemini settings panel ─────────────────────────────────────────────────────

const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash (recommended)' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash' },
];

const DEFAULT_PROMPT =
  `Travel assistant{location}. Return a JSON array only, no markdown.\n` +
  `Each item: {"title":"short name","location":"full street address, city","country":"country","notes":"1-2 sentence description"}\n` +
  `Request: {question}`;

function GeminiSettings({
  user, sb, apiKey, model, prompt, onSaved,
  canManageTrip, tripNameEdit, savingTripName, deletingTrip,
  trips, currentTripId, members, joinCode, displayName, creatingTrip, joiningTrip,
  newTripName, onSelectTrip, onJoinCodeChange, onDisplayNameChange, onNewTripNameChange,
  onTripNameEditChange, onRenameTrip, onDeleteTrip, onCreateTrip, onJoinTrip, onCopyInvite,
  travelTimeFilter, onTravelTimeFilterChange,
}) {
  const [open,    setOpen]    = useState(false);
  const [key,     setKey]     = useState(apiKey);
  const [mod,     setMod]     = useState(model || 'gemini-2.0-flash');
  const [pmt,     setPmt]     = useState(prompt || DEFAULT_PROMPT);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setKey(apiKey); setMod(model || 'gemini-2.0-flash'); setPmt(prompt || DEFAULT_PROMPT); }, [apiKey, model, prompt]);

  const save = async () => {
    setSaving(true);
    const upsert = (k, v) => sb.from('user_settings').upsert({ user_id: user.id, key: k, value: v }, { onConflict: 'user_id,key' });
    await Promise.all([
      upsert('travel_gemini_api_key', key.trim()),
      upsert('travel_gemini_model', mod),
      upsert('travel_gemini_prompt', pmt.trim()),
    ]);
    setSaving(false);
    onSaved(key.trim(), mod, pmt.trim());
    setOpen(false);
  };

  const selectSt = { ...inputSt, cursor: 'pointer' };

  return (
    <div style={{ marginBottom: 16, display: 'grid', justifyItems: 'end' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Settings"
        aria-label="Travel settings"
        style={{
          ...btnStyle(false, open ? CLAY.blueDk : CLAY.textMid),
          width: 38,
          height: 38,
          borderRadius: UI.controlRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          boxShadow: open ? CLAY.shadow : '0 3px 10px rgba(0,0,0,0.04)',
          background: open ? '#eef2ff' : '#fff',
          borderColor: open ? '#c7d2fe' : '#e8e8e8',
        }}
      >
        <Settings size={15} />
      </button>
      {open && (
        <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #e0eaf4', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ ...S.label, marginBottom: 14 }}>Settings</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...S.label, marginBottom: 8 }}>Display</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'upcoming', label: 'Upcoming', help: 'Current and future items' },
                { id: 'past', label: 'Past', help: 'Completed trip items' },
                { id: 'all', label: 'All', help: 'Full itinerary' },
              ].map(option => (
                <button
                  key={option.id}
                  onClick={() => onTravelTimeFilterChange(option.id)}
                  title={option.help}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: `1.5px solid ${travelTimeFilter === option.id ? CLAY.blueDk : '#e4e4e4'}`,
                    background: travelTimeFilter === option.id ? CLAY.text : CLAY.surface,
                    color: travelTimeFilter === option.id ? '#fff' : CLAY.textMid,
                    fontFamily: MONO,
                    fontSize: FS.compact,
                    cursor: 'pointer',
                    boxShadow: travelTimeFilter === option.id ? CLAY.shadow : 'none',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div style={{ ...S.mid, marginTop: 8 }}>
              Places under a hotel stay follow that hotel until checkout.
            </div>
          </div>
          <div style={{ height: 1, background: '#e5edf7', margin: '14px 0' }} />
          <TravelSharePanel
            canManageTrip={canManageTrip}
            tripNameEdit={tripNameEdit}
            savingTripName={savingTripName}
            deletingTrip={deletingTrip}
            trips={trips}
            currentTripId={currentTripId}
            members={members}
            joinCode={joinCode}
            displayName={displayName}
            newTripName={newTripName}
            creatingTrip={creatingTrip}
            joiningTrip={joiningTrip}
            onSelectTrip={onSelectTrip}
            onJoinCodeChange={onJoinCodeChange}
            onDisplayNameChange={onDisplayNameChange}
            onNewTripNameChange={onNewTripNameChange}
            onTripNameEditChange={onTripNameEditChange}
            onRenameTrip={onRenameTrip}
            onDeleteTrip={onDeleteTrip}
            onCreateTrip={onCreateTrip}
            onJoinTrip={onJoinTrip}
            onCopyInvite={onCopyInvite}
          />

          {canManageTrip && (
            <>
              <div style={{ height: 1, background: '#e5edf7', margin: '16px 0' }} />
              <div style={{ ...S.label, marginBottom: 10 }}>AI</div>
              <div style={{ ...S.caption, marginBottom: 2 }}>GEMINI API KEY</div>
              <input type="password" value={key} onChange={e => setKey(e.target.value)}
                placeholder="AIza…" style={{ ...inputSt, marginBottom: 10 }} />

              <div style={{ ...S.caption, marginBottom: 2 }}>MODEL</div>
              <select value={mod} onChange={e => setMod(e.target.value)} style={{ ...selectSt, marginBottom: 10 }}>
                {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>

              <div style={{ ...S.caption, marginBottom: 2 }}>PROMPT TEMPLATE</div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: CLAY.textLt, marginBottom: 4 }}>
                Use <code style={{ background: '#eef2ff', padding: '1px 4px', borderRadius: 3 }}>{'{location}'}</code> for nearby context and <code style={{ background: '#eef2ff', padding: '1px 4px', borderRadius: 3 }}>{'{question}'}</code> for the user's question.
              </div>
              <textarea value={pmt} onChange={e => setPmt(e.target.value)} rows={6}
                style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5, fontSize: 12, marginBottom: 10 }} />

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setPmt(DEFAULT_PROMPT)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #d0d8e8', background: '#fff', fontFamily: MONO, fontSize: 11, color: CLAY.textMid, cursor: 'pointer' }}>Reset prompt</button>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 11, fontFamily: MONO, color: CLAY.textLt }}>
                  Key at <span style={{ color: CLAY.blueDk }}>aistudio.google.com</span>
                </div>
                <button onClick={save} disabled={saving || !key.trim()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving || !key.trim() ? '#e0e0e0' : CLAY.blueDk, color: saving || !key.trim() ? CLAY.textLt : '#fff', fontFamily: MONO, fontSize: FS.compact, fontWeight: FW.semibold, cursor: saving || !key.trim() ? 'default' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TravelSharePanel({
  canManageTrip, tripNameEdit, savingTripName, deletingTrip,
  trips, currentTripId, members, joinCode, displayName, creatingTrip, joiningTrip,
  newTripName, onSelectTrip, onJoinCodeChange, onDisplayNameChange, onNewTripNameChange,
  onTripNameEditChange, onRenameTrip, onDeleteTrip, onCreateTrip, onJoinTrip, onCopyInvite,
}) {
  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...S.label, marginBottom: 2 }}>Sharing</div>
          <div style={{ ...S.mid, marginTop: 4 }}>
            Share this travel plan with another signed-in user using the invite code.
          </div>
        </div>
        {currentTrip?.invite_code && (
          <button onClick={onCopyInvite} style={{ ...btnStyle(false, CLAY.blueDk), padding: '8px 12px', borderRadius: UI.controlRadius }}>
            Copy invite
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <div style={{ ...S.caption, marginBottom: 4 }}>ACTIVE TRIP</div>
          <select value={currentTripId || ''} onChange={e => onSelectTrip(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
            {trips.map(t => <option key={t.id} value={t.id}>{t.name || 'My Travel'}</option>)}
          </select>
        </div>
        <div>
          <div style={{ ...S.caption, marginBottom: 4 }}>INVITE CODE</div>
          <div style={{ ...inputSt, minHeight: 45, display: 'flex', alignItems: 'center', letterSpacing: '0.08em' }}>
            {currentTrip?.invite_code || 'Creating...'}
          </div>
        </div>
      </div>

      {canManageTrip && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center' }}>
          <input value={tripNameEdit} onChange={e => onTripNameEditChange(e.target.value)} placeholder="Trip name" style={inputSt} />
          <button onClick={onRenameTrip} disabled={savingTripName || !tripNameEdit.trim() || tripNameEdit.trim() === (currentTrip?.name || '')} style={{ ...btnStyle(savingTripName || !tripNameEdit.trim() || tripNameEdit.trim() === (currentTrip?.name || ''), CLAY.blueDk), padding: '12px 14px', borderRadius: UI.controlRadius }}>
            {savingTripName ? <Spinner /> : 'Rename'}
          </button>
          <button onClick={onDeleteTrip} disabled={deletingTrip} style={{ ...btnStyle(deletingTrip, '#dc2626'), padding: '12px 14px', borderRadius: UI.controlRadius }}>
            {deletingTrip ? <Spinner /> : 'Delete'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center' }}>
        <input value={newTripName} onChange={e => onNewTripNameChange(e.target.value)} placeholder="New trip name" style={inputSt} />
        <button onClick={onCreateTrip} disabled={creatingTrip || !newTripName.trim()} style={{ ...btnStyle(creatingTrip || !newTripName.trim(), CLAY.blueDk), padding: '12px 14px', borderRadius: UI.controlRadius }}>
          {creatingTrip ? <Spinner /> : 'Create'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', alignItems: 'center' }}>
        <input value={joinCode} onChange={e => onJoinCodeChange(e.target.value)} placeholder="Invite code" style={inputSt} />
        <input value={displayName} onChange={e => onDisplayNameChange(e.target.value)} placeholder="Your display name" style={inputSt} />
        <button onClick={onJoinTrip} disabled={joiningTrip || !joinCode.trim()} style={{ ...btnStyle(joiningTrip || !joinCode.trim(), CLAY.blueDk), padding: '12px 14px', borderRadius: UI.controlRadius }}>
          {joiningTrip ? <Spinner /> : 'Join'}
        </button>
      </div>

      {members.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {members.map(m => (
            <span key={m.user_id} style={{ ...S.mid, background: CLAY.surf2, borderRadius: 999, padding: '6px 10px' }}>
              {m.display_name || 'Member'}{m.role === 'owner' ? ' · owner' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TravelWeatherCard({ location }) {
  const [forecast, setForecast] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!location?.query) {
      setForecast(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    const loadWeather = async () => {
      setStatus('loading');
      try {
        const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.query)}&count=1&language=en&format=json`);
        const geo = await geoResp.json();
        const place = geo.results?.[0];
        if (!place) throw new Error('No weather location found');
        const forecastResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=auto`);
        const data = await forecastResp.json();
        const days = (data.daily?.time || []).map((date, i) => ({
          date,
          code: Number(data.daily.weather_code?.[i]),
          max: Math.round(Number(data.daily.temperature_2m_max?.[i])),
          min: Math.round(Number(data.daily.temperature_2m_min?.[i])),
          rain: data.daily.precipitation_probability_max?.[i],
        }));
        if (!cancelled) {
          setForecast({ place: place.name || location.label, days });
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setForecast(null);
          setStatus('error');
        }
      }
    };
    loadWeather();
    return () => { cancelled = true; };
  }, [location?.query, location?.label]);

  if (!location?.query || status === 'error') return null;

  return (
    <div style={{ ...S.card, margin: '0 16px 12px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ ...S.label, fontSize: FS.lg }}>Weather</div>
        <div style={{ ...S.mid }}>{forecast?.place || location.label}</div>
      </div>
      {status === 'loading' ? (
        <div style={{ ...S.mid }}>Loading forecast…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
          {(forecast?.days || []).map(day => (
            <div key={day.date} style={{ background: CLAY.surf2, borderRadius: 12, padding: '8px 6px', textAlign: 'center', fontFamily: MONO }}>
              <div style={{ color: CLAY.textLt, fontSize: FS.compact }}>{fmtShortDate(day.date)}</div>
              <div style={{ fontSize: 20, margin: '3px 0' }}>{weatherIcon(day.code)}</div>
              <div style={{ color: CLAY.text, fontSize: FS.compact, fontWeight: FW.semibold }}>{day.max}°/{day.min}°</div>
              <div style={{ color: CLAY.textMid, fontSize: 11 }}>{WEATHER_CODE_LABELS[day.code] || 'Forecast'}</div>
              {day.rain != null && <div style={{ color: CLAY.blueDk, fontSize: 11 }}>{day.rain}% rain</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TravelTab({ user, sb, showToast }) {
  const isWide = useIsWide();
  const [bookings,    setBookings]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [geminiKey,    setGeminiKey]    = useState('');
  const [geminiModel,  setGeminiModel]  = useState('gemini-2.0-flash');
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [trips,        setTrips]        = useState([]);
  const [currentTripId, setCurrentTripId] = useState('');
  const [members,      setMembers]      = useState([]);
  const [joinCode,     setJoinCode]     = useState('');
  const [displayName,  setDisplayName]  = useState(user?.email || '');
  const [newTripName,  setNewTripName]  = useState('');
  const [tripNameEdit, setTripNameEdit] = useState('');
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [joiningTrip,  setJoiningTrip]  = useState(false);
  const [savingTripName, setSavingTripName] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [travelFilter, setTravelFilter] = useState('all');
  const [travelTimeFilter, setTravelTimeFilter] = useState(() => window.localStorage.getItem('splitease_travel_time_filter') || 'upcoming');

  const currentTrip = useMemo(
    () => trips.find(t => t.id === currentTripId) || trips[0] || null,
    [trips, currentTripId]
  );
  const canManageCurrentTrip = !!currentTrip && currentTrip.owner_id === user?.id;
  const activeTripName = currentTrip?.name || 'My Travel';

  const normalizeTripRows = (rows) => (rows || [])
    .map(row => ({ ...(row.travel_trips || {}), memberRole: row.role, memberName: row.display_name }))
    .filter(t => t.id);

  const loadMembers = async (tripId) => {
    if (!tripId) { setMembers([]); return; }
    const { data, error } = await sb.from('travel_trip_members')
      .select('trip_id,user_id,display_name,role')
      .eq('trip_id', tripId)
      .order('role', { ascending: false })
      .order('joined_at', { ascending: true });
    if (error) { setMembers([]); return; }
    setMembers(data || []);
  };

  const createTrip = async (name = 'My Travel') => {
    const { data: trip, error } = await sb.from('travel_trips')
      .insert({ owner_id: user.id, name: name.trim() || 'My Travel' })
      .select('*')
      .single();
    if (error) throw error;
    const { error: memberError } = await sb.from('travel_trip_members').insert({
      trip_id: trip.id,
      user_id: user.id,
      display_name: user.email || 'Me',
      role: 'owner',
    });
    if (memberError) throw memberError;
    return trip;
  };

  const loadTrips = async () => {
    if (!user) return;
    const { data, error } = await sb.from('travel_trip_members')
      .select('trip_id,display_name,role,travel_trips(id,name,invite_code,owner_id)')
      .eq('user_id', user.id);
    if (error) {
      showToast?.('Travel sharing failed to load: ' + error.message);
      return;
    }
    let nextTrips = normalizeTripRows(data);
    if (!nextTrips.length) {
      try {
        const trip = await createTrip('My Travel');
        nextTrips = [trip];
      } catch (err) {
        showToast?.('Travel trip setup failed: ' + err.message);
      }
    }
    setTrips(nextTrips);
    const saved = window.localStorage.getItem('splitease_travel_trip_id');
    const nextId = nextTrips.find(t => t.id === saved)?.id || nextTrips[0]?.id || '';
    setCurrentTripId(nextId);
    await loadMembers(nextId);
  };

  const load = async () => {
    if (!user || !currentTripId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await sb.from('travel_bookings')
      .select('*').eq('trip_id', currentTripId)
      .order('sort_order', { ascending: true }).order('start_date', { ascending: true });
    setBookings(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.email || '');
    loadTrips();
    sb.from('user_settings').select('*').eq('user_id', user.id).then(({ data }) => {
      if (!data) return;
      const k = data.find(r => r.key === 'travel_gemini_api_key');
      const m = data.find(r => r.key === 'travel_gemini_model');
      const p = data.find(r => r.key === 'travel_gemini_prompt');
      if (k?.value) setGeminiKey(k.value);
      if (m?.value) setGeminiModel(m.value);
      if (p?.value) setGeminiPrompt(p.value);
    });
  }, [user]);

  useEffect(() => {
    if (!currentTripId) return;
    window.localStorage.setItem('splitease_travel_trip_id', currentTripId);
    loadMembers(currentTripId);
    load();
  }, [currentTripId]);

  useEffect(() => {
    setTripNameEdit(currentTrip?.name || '');
  }, [currentTrip?.id, currentTrip?.name]);

  useEffect(() => {
    window.localStorage.setItem('splitease_travel_time_filter', travelTimeFilter);
  }, [travelTimeFilter]);

  const handleSelectTrip = (tripId) => setCurrentTripId(tripId);

  const handleCreateTrip = async () => {
    if (!newTripName.trim() || creatingTrip) return;
    setCreatingTrip(true);
    try {
      const trip = await createTrip(newTripName);
      setTrips(prev => [...prev, trip]);
      setCurrentTripId(trip.id);
      setNewTripName('');
      showToast?.('Travel trip created');
    } catch (err) {
      showToast?.('Create failed: ' + err.message);
    }
    setCreatingTrip(false);
  };

  const handleRenameTrip = async () => {
    const name = tripNameEdit.trim();
    if (!currentTrip || !canManageCurrentTrip || !name || name === currentTrip.name || savingTripName) return;
    setSavingTripName(true);
    try {
      const { error } = await sb.from('travel_trips')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', currentTrip.id);
      if (error) throw error;
      await sb.from('travel_bookings').update({ trip_name: name }).eq('trip_id', currentTrip.id);
      setTrips(prev => prev.map(t => t.id === currentTrip.id ? { ...t, name } : t));
      showToast?.('Travel trip renamed');
    } catch (err) {
      showToast?.('Rename failed: ' + err.message);
    }
    setSavingTripName(false);
  };

  const handleDeleteTrip = async () => {
    if (!currentTrip || !canManageCurrentTrip || deletingTrip) return;
    if (!window.confirm(`Delete "${currentTrip.name || 'this trip'}" and all travel items in it?`)) return;
    setDeletingTrip(true);
    try {
      const { error } = await sb.from('travel_trips').delete().eq('id', currentTrip.id);
      if (error) throw error;
      const remaining = trips.filter(t => t.id !== currentTrip.id);
      if (remaining.length) {
        setTrips(remaining);
        setCurrentTripId(remaining[0].id);
      } else {
        const trip = await createTrip('My Travel');
        setTrips([trip]);
        setCurrentTripId(trip.id);
      }
      setBookings([]);
      showToast?.('Travel trip deleted');
    } catch (err) {
      showToast?.('Delete failed: ' + err.message);
    }
    setDeletingTrip(false);
  };

  const handleJoinTrip = async () => {
    if (!joinCode.trim() || joiningTrip) return;
    setJoiningTrip(true);
    try {
      const { data, error } = await sb.rpc('join_travel_trip_by_invite_code', {
        p_invite_code: joinCode,
        p_display_name: displayName,
      });
      if (error) throw error;
      await loadTrips();
      if (data?.id) setCurrentTripId(data.id);
      setJoinCode('');
      showToast?.('Travel trip joined');
    } catch (err) {
      showToast?.('Join failed: ' + err.message);
    }
    setJoiningTrip(false);
  };

  const handleCopyInvite = async () => {
    if (!currentTrip?.invite_code) return;
    try {
      await navigator.clipboard.writeText(currentTrip.invite_code);
      showToast?.('Invite code copied');
    } catch {
      showToast?.(`Invite code: ${currentTrip.invite_code}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    let query = sb.from('travel_bookings').delete().eq('id', id);
    if (currentTripId) query = query.eq('trip_id', currentTripId);
    const { error } = await query;
    if (error) { showToast?.('Delete failed: ' + error.message); return; }
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const handleUpdate = (updated) => setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));

  const handleMove = async (tripItems, idx, direction) => {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= tripItems.length) return;
    const reordered = [...tripItems];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const updates = reordered.map((b, i) => ({ id: b.id, sort_order: i * 10 }));
    setBookings(prev => {
      const map = Object.fromEntries(updates.map(u => [u.id, u.sort_order]));
      return prev.map(b => map[b.id] !== undefined ? { ...b, sort_order: map[b.id] } : b)
        .sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.start_date.localeCompare(b.start_date));
    });
    for (const u of updates) {
      let query = sb.from('travel_bookings').update({ sort_order: u.sort_order }).eq('id', u.id);
      if (currentTripId) query = query.eq('trip_id', currentTripId);
      await query;
    }
  };

  const matchesTravelFilter = (b) => {
    if (travelFilter === 'all') return true;
    if (travelFilter === 'flights') return b.type === 'flight';
    if (travelFilter === 'hotels') return b.type === 'hotel';
    if (travelFilter === 'places') return b.type === 'note';
    if (travelFilter === 'food') return b.type === 'note' && ['restaurant', 'cafe'].includes(b.details?.place_type);
    if (travelFilter === 'shops') return b.type === 'note' && b.details?.place_type === 'shop';
    if (travelFilter === 'sightseeing') return b.type === 'note' && b.details?.place_type === 'sightseeing';
    return true;
  };
  const today = new Date().toISOString().slice(0, 10);
  const contextualBookings = annotateTravelStayContext(bookings);
  const isUpcomingOrActive = (b) => {
    const visibleUntil = b.visibleUntilDate || b.end_date || b.start_date;
    return !visibleUntil || visibleUntil >= today;
  };
  const timeFilteredBookings = contextualBookings.filter((b) => {
    const upcoming = isUpcomingOrActive(b);
    if (travelTimeFilter === 'past') return !upcoming;
    if (travelTimeFilter === 'all') return true;
    return upcoming;
  });
  const visibleBookings = timeFilteredBookings.filter(matchesTravelFilter);
  const travelFilters = [
    { id: 'all', label: 'All', count: timeFilteredBookings.length },
    { id: 'flights', label: 'Flights', count: timeFilteredBookings.filter(b => b.type === 'flight').length },
    { id: 'hotels', label: 'Hotels', count: timeFilteredBookings.filter(b => b.type === 'hotel').length },
    { id: 'places', label: 'Places', count: timeFilteredBookings.filter(b => b.type === 'note').length },
    { id: 'food', label: 'Food', count: timeFilteredBookings.filter(b => b.type === 'note' && ['restaurant', 'cafe'].includes(b.details?.place_type)).length },
    { id: 'shops', label: 'Shops', count: timeFilteredBookings.filter(b => b.type === 'note' && b.details?.place_type === 'shop').length },
    { id: 'sightseeing', label: 'Sightseeing', count: timeFilteredBookings.filter(b => b.type === 'note' && b.details?.place_type === 'sightseeing').length },
  ];
  const weatherLocation = pickWeatherLocation(contextualBookings, today);

  // Group: month -> active trip name -> [bookings]
  const grouped = {};
  for (const b of visibleBookings) {
    const ym = b.start_date.slice(0, 7), trip = activeTripName;
    if (!grouped[ym]) grouped[ym] = {};
    if (!grouped[ym][trip]) grouped[ym][trip] = [];
    grouped[ym][trip].push(b);
  }
  const groupedEntries = Object.entries(grouped).sort(([a], [b]) => (
    travelTimeFilter === 'past' ? b.localeCompare(a) : a.localeCompare(b)
  ));
  const emptyCopy = travelTimeFilter === 'past'
    ? 'No past travel'
    : travelTimeFilter === 'all'
      ? 'No travel items'
      : 'No upcoming travel';

  return (
    <div style={{ paddingBottom: isWide ? 40 : 80 }}>
      <style>{`@keyframes travel-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '32px 16px 0' }}>
        <div style={SHELL_HEADING_STYLE}>TRAVEL</div>
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <GeminiSettings user={user} sb={sb} apiKey={geminiKey} model={geminiModel} prompt={geminiPrompt}
          onSaved={(k, m, p) => { setGeminiKey(k); setGeminiModel(m); setGeminiPrompt(p); }}
          canManageTrip={canManageCurrentTrip}
          tripNameEdit={tripNameEdit}
          savingTripName={savingTripName}
          deletingTrip={deletingTrip}
          trips={trips}
          currentTripId={currentTripId}
          members={members}
          joinCode={joinCode}
          displayName={displayName}
          newTripName={newTripName}
          creatingTrip={creatingTrip}
          joiningTrip={joiningTrip}
          onSelectTrip={handleSelectTrip}
          onJoinCodeChange={setJoinCode}
          onDisplayNameChange={setDisplayName}
          onNewTripNameChange={setNewTripName}
          onTripNameEditChange={setTripNameEdit}
          onRenameTrip={handleRenameTrip}
          onDeleteTrip={handleDeleteTrip}
          onCreateTrip={handleCreateTrip}
          onJoinTrip={handleJoinTrip}
          onCopyInvite={handleCopyInvite}
          travelTimeFilter={travelTimeFilter}
          onTravelTimeFilterChange={setTravelTimeFilter}
        />
      </div>
      <TravelWeatherCard location={weatherLocation} />
      {timeFilteredBookings.length > 0 && (
        <div style={{ padding: '0 16px 4px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {travelFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setTravelFilter(f.id)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                border: `1.5px solid ${travelFilter === f.id ? CLAY.blueDk : '#e4e4e4'}`,
                background: travelFilter === f.id ? CLAY.text : CLAY.surface,
                color: travelFilter === f.id ? '#fff' : CLAY.textMid,
                fontFamily: MONO,
                fontSize: FS.compact,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                boxShadow: travelFilter === f.id ? CLAY.shadow : 'none',
              }}
            >
              {f.label}{f.count ? ` ${f.count}` : ''}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', fontFamily: MONO, color: CLAY.textLt, fontSize: FS.lg }}>Loading…</div>
      ) : timeFilteredBookings.length === 0 ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', fontFamily: MONO, color: CLAY.textLt, fontSize: FS.lg }}>{emptyCopy}</div>
      ) : visibleBookings.length === 0 ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', fontFamily: MONO, color: CLAY.textLt, fontSize: FS.lg }}>No items in this filter</div>
      ) : (
        <div style={{ padding: '20px 16px 0' }}>
          {groupedEntries.map(([ym, trips]) => (
            <div key={ym} style={{ marginBottom: 32 }}>
              <div style={{ fontSize: FS.compact, fontWeight: FW.semibold, fontFamily: MONO, color: CLAY.textLt, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                {monthLabel(ym)}
              </div>

              {Object.entries(trips).map(([tripName, tripItems]) => {
                const expanded = expandForTimeline(tripItems);
                return (
                  <div key={tripName} style={{ marginBottom: 20 }}>
                    {tripName && <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, fontFamily: MONO, color: CLAY.text, marginBottom: 10 }}>🗺 {tripName}</div>}

                    {expanded.map((item, ei) => {
                      const prev = ei > 0 ? expanded[ei - 1] : null;
                      const next = ei < expanded.length - 1 ? expanded[ei + 1] : null;
                      const showDate = !prev || item._viewDate !== prev._viewDate;
                      const isSameHotelNext = next && item.id === next.id && next._view === 'checkout';

                      const commonCardProps = {
                        b: item, sb,
                        onDelete:    () => handleDelete(item.id),
                        onMoveUp:    () => handleMove(tripItems, item._origIdx, -1),
                        onMoveDown:  () => handleMove(tripItems, item._origIdx,  1),
                        canMoveUp:   item._origIdx > 0,
                        canMoveDown: item._origIdx < tripItems.length - 1,
                        onUpdate:    handleUpdate,
                        apiKey: geminiKey, model: geminiModel,
                      };

                      const connectorProps = {
                        insertAfterIdx: item._origIdx,
                        tripItems, tripName: activeTripName, userId: user.id, tripId: currentTripId,
                        apiKey: geminiKey, model: geminiModel, sb,
                        promptTemplate: geminiPrompt || DEFAULT_PROMPT,
                        onInserted: load,
                      };

                      return (
                        <React.Fragment key={`${item.id}_${item._view}`}>
                          {showDate && <DateDivider date={item._viewDate} />}

                          {item._view === 'flight'   && <FlightCard      {...commonCardProps} />}
                          {item._view === 'checkin'  && <HotelCard       {...commonCardProps} asCheckin />}
                          {item._view === 'checkout' && <HotelCheckoutCard b={item} />}
                          {item._view === 'note'     && <NoteCard         {...commonCardProps} />}

                          {isSameHotelNext
                            ? <HotelStayConnector {...connectorProps} b={item} />
                            : <ItemConnector {...connectorProps} before={item} after={next} />
                          }
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
