// Rutas en transporte público (metro, bus, Cercanías, interurbanos) con Transitous (MOTIS 2), servicio abierto y gratuito.
// /api/ruta?from=lat,lon&to=lat,lon[&time=ISO&arriveBy=1]&key=...   ·   /api/ruta?geo=texto&key=...
import { checkKey } from './_emt.js';

const BASE = 'https://api.transitous.org';
const UA = 'Parada/1.0 (app personal; github.com/ZumoDePato/TDMAPS)';
const ll = s => { const m = String(s || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? `${(+m[1]).toFixed(6)},${(+m[2]).toFixed(6)}` : null; };
const mins = s => Math.max(0, Math.round((Number(s) || 0) / 60));

async function get(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error('Transitous ' + r.status);
  return r.json();
}

function simplify(it) {
  const legs = (it.legs || []).map(l => {
    const mode = String(l.mode || '').toUpperCase();
    return {
      mode,
      line: l.routeShortName || l.displayName || l.routeLongName || null,
      headsign: l.headsign || l.tripTo?.name || null,
      agency: l.agencyName || null,
      color: l.routeColor ? '#' + String(l.routeColor).replace('#', '') : null,
      from: l.from?.name || null, to: l.to?.name || null,
      fromLL: l.from ? [l.from.lat, l.from.lon] : null, toLL: l.to ? [l.to.lat, l.to.lon] : null,
      dep: l.startTime || l.from?.departure || null, arr: l.endTime || l.to?.arrival || null,
      track: l.from?.track || null,
      min: mins(l.duration),
      dist: l.distance != null ? Math.round(l.distance) : null,
      stops: Array.isArray(l.intermediateStops) ? l.intermediateStops.length + 1 : null,
      inter: Array.isArray(l.intermediateStops) ? l.intermediateStops.slice(0, 60).filter(p => p && p.lat != null).map(p => [p.lat, p.lon, p.name || '']) : [],
      realTime: !!l.realTime,
      geom: l.legGeometry?.points || null,
      precision: l.legGeometry?.precision || 6,
    };
  });
  return { min: mins(it.duration), start: it.startTime || null, end: it.endTime || null, transfers: it.transfers ?? Math.max(0, legs.filter(x => x.mode !== 'WALK').length - 1), legs };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!checkKey(req)) { res.status(401).json({ error: 'Clave incorrecta' }); return; }
  const u = new URL(req.url, 'http://localhost');
  try {
    const rev = ll(u.searchParams.get('rev'));
    if (rev) {
      let name = null;
      try {
        const j = await get(`/api/v1/reverse-geocode?place=${rev}&language=es`);
        const m = (Array.isArray(j) ? j : []).find(x => x && x.name);
        if (m) name = [m.name, m.houseNumber].filter(Boolean).join(', ');
        if (m && m.type === 'STOP') name = 'Parada ' + m.name;
      } catch (e) {}
      res.setHeader('Cache-Control', 's-maxage=300');
      res.status(200).json({ n: name });
      return;
    }
    const geo = u.searchParams.get('geo');
    if (geo) {
      const near = ll(u.searchParams.get('near'));
      const j = await get(`/api/v1/geocode?text=${encodeURIComponent(geo)}&language=es${near ? '&place=' + near : ''}`);
      res.setHeader('Cache-Control', 's-maxage=86400');
      res.status(200).json((Array.isArray(j) ? j : []).slice(0, 8).map(m => ({
        n: m.name, lat: m.lat, lon: m.lon, tipo: m.type,
        zona: (m.areas || []).filter(a => a.matched || a.default).map(a => a.name).filter(x => x && x !== m.name).slice(0, 2).join(', ') || (m.areas || []).map(a => a.name).slice(-2, -1)[0] || '',
      })));
      return;
    }
    const from = ll(u.searchParams.get('from')), to = ll(u.searchParams.get('to'));
    if (!from || !to) { res.status(400).json({ error: 'Faltan origen o destino' }); return; }
    const q = new URLSearchParams({ fromPlace: from, toPlace: to, detailedTransfers: 'false', numItineraries: '4', language: 'es' });
    const t = u.searchParams.get('time'); if (t) q.set('time', t);
    if (u.searchParams.get('arriveBy') === '1') q.set('arriveBy', 'true');
    let j, lastErr;
    for (const v of ['v5', 'v4', 'v3']) {
      try { j = await get(`/api/${v}/plan?${q}`); break; } catch (e) { lastErr = e; }
    }
    if (!j) throw lastErr;
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json({ itinerarios: (j.itineraries || []).map(simplify), directo: (j.direct || []).map(simplify).slice(0, 1) });
  } catch (e) {
    res.status(502).json({ error: 'No he podido calcular la ruta ahora (' + e.message + ').' });
  }
}
