/* Bay and line symbols: one place that defines what each symbol is and what it means. */
const BAY = {
  permit:   { label: 'Permit holder bay', color: '#2b6fdc', glyph: 'P',
    what: 'Permit holders only during the zone hours. Pay-by-phone and limited-stay bays are signed separately, so read the bay sign.',
    who: 'Newham Council', conf: 'inferred from the zone: OpenStreetMap has no per-bay signs' },
  disabled: { label: 'Blue Badge bay', color: '#0b57d0', glyph: 'wheel',
    what: 'Blue Badge holders only, badge displayed. On Newham streets you may also park free for up to 3 hours on yellow lines with badge and clock.',
    who: 'Whoever owns the road or car park', conf: 'from OpenStreetMap bay counts' },
  ev:       { label: 'EV charging bay', color: '#0f9d7a', glyph: 'bolt',
    what: 'Charge points. Bays are for vehicles that are charging. The rules of the road or car park they sit on still apply, and the charge operator has its own app and tariff.',
    who: 'Charge operator, plus the landowner', conf: 'from OpenStreetMap' },
  customer: { label: 'Customer car park', color: '#7b3fa0', glyph: 'P',
    what: 'Private car park for shoppers. Usually free for a set time, with ANPR cameras. Overstay and you get a private Parking Charge Notice.',
    who: 'Landowner or its parking company', conf: 'from OpenStreetMap access tag and operator sites' },
  private:  { label: 'Private bay', color: '#f29f05', glyph: 'lock',
    what: 'Private land. Residents, tenants or staff only, set by the owner or management company. Newham does not enforce here.',
    who: 'Landlord or managing agent', conf: 'inferred: not on Newham adopted highway' },
  carpark:  { label: 'Car park, access not recorded', color: '#6b7280', glyph: 'P',
    what: 'A mapped car park with no access rule recorded. Treat as private and read the entrance signs.',
    who: 'Unknown, read the signs', conf: 'OpenStreetMap, access not tagged' },
  cycle:    { label: 'Cycle parking', color: '#5a6b7b', glyph: 'bike',
    what: 'Bike stands. Not part of the car parking rules.', who: 'Landowner', conf: 'from OpenStreetMap' },
  taxi:     { label: 'Taxi rank', color: '#e0a800', glyph: 'TAXI',
    what: 'Licensed taxis only. Do not stop here.', who: 'Newham Council (if on the road)', conf: 'from OpenStreetMap' }
};
const LINE = {
  wait: { label: 'Yellow line: no waiting', color: '#f2c300',
    what: 'No waiting during the hours on the nearby plate. A single yellow usually allows evenings and Sundays, a double yellow is usually no waiting at any time. OpenStreetMap does not record which, so read the plate.' },
  stop: { label: 'Red line: no stopping', color: '#e5383b',
    what: 'Red Route. No stopping at all, apart from Blue Badge set-down on double red and the hours shown on single red plates. TfL enforces.' }
};

const GLYPH = {
  P: '<text x="12" y="17" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="15" fill="#fff">P</text>',
  TAXI: '<text x="12" y="15" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="7" fill="#fff">TAXI</text>',
  bolt: '<polygon points="13.5,3 6,13.5 11,13.5 10,21 18,10 13,10" fill="#fff"/>',
  wheel: '<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="5.5" r="1.4" fill="#fff"/><path d="M11 8.5v6h5l2.5 4.5M8.2 11.8a5 5 0 1 0 7 6.3"/></g>',
  bike: '<g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="16" r="3.2"/><circle cx="17.5" cy="16" r="3.2"/><path d="M6.5 16l4-7h5l2 7M10.5 9H8.5M12 16l3.5-7"/></g>',
  lock: '<g><rect x="6.5" y="11" width="11" height="8.5" rx="1.5" fill="#fff"/><path d="M9 11V8.5a3 3 0 0 1 6 0V11" fill="none" stroke="#fff" stroke-width="2"/></g>'
};

function symbolSVG(type, size) {
  const b = BAY[type];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${b.color}" stroke="#fff" stroke-width="1.6"/>${GLYPH[b.glyph]}</svg>`;
}
function lineSwatch(k) {
  const l = LINE[k];
  return `<svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true"><line x1="2" y1="7" x2="38" y2="7" stroke="${k === 'stop' ? '#fff' : '#555'}" stroke-width="9" stroke-linecap="round" opacity=".0"/><line x1="2" y1="7" x2="38" y2="7" stroke="${l.color}" stroke-width="5" stroke-linecap="round"/>${k === 'wait' ? '<line x1="2" y1="12" x2="38" y2="12" stroke="' + l.color + '" stroke-width="3" stroke-linecap="round"/>' : ''}</svg>`;
}
function bayIcon(m) {
  const n = m.n > 1 && !m.big ? `<span class="cnt">${m.n}</span>` : (m.n > 1 && m.t === 'disabled' ? `<span class="cnt">${m.n}</span>` : '');
  return L.divIcon({ className: 'bayicon', html: `<div class="bi">${symbolSVG(m.t, 28)}${n}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}
