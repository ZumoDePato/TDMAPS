// Rutas en Metro de Madrid con un grafo propio (Transitous no tiene el Metro).
import M from './_metrodata.js';

const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const WALK = 1.25; // m/s (4,5 km/h)
const walkS = m => (m * 1.3) / WALK;
const WAIT = 210, DWELL = 25, TRANSFER = 300, CHANGE_PENALTY = 150;

const ST = M.stations; // [name, lat, lon]
const ADJ = ST.map(() => []);
// los tiempos del grafo original salen ~2,5 veces más largos que los reales: se escalan
for (const [a, b, line, s] of M.edges) ADJ[a].push({ b, line, s: Math.max(70, Math.round(s * 0.4)) });

// terminal de una línea siguiendo el sentido prev -> cur
function headsign(prev, cur, line) {
  let p = prev, c = cur, guard = 0;
  while (guard++ < 80) {
    const nx = ADJ[c].filter(e => e.line === line && e.b !== p);
    if (!nx.length) return ST[c][0];
    if (nx.length > 1) break;
    p = c; c = nx[0].b;
    if (c === cur) return null; // circular
  }
  return null;
}

export function metroPlan(O, D, startMs = Date.now()) {
  const oc = ST.map((s, i) => ({ i, m: dist(O, [s[1], s[2]]) })).sort((a, b) => a.m - b.m).filter((x, k) => k < 4 && x.m < 1800);
  const dc = ST.map((s, i) => ({ i, m: dist([s[1], s[2]], D) })).sort((a, b) => a.m - b.m).filter((x, k) => k < 4 && x.m < 1800);
  if (!oc.length || !dc.length) return [];
  // Dijkstra sobre (estación, línea)
  const key = (i, l) => i + '|' + l, best = new Map(), prev = new Map(), pq = [];
  const push = (c, i, l, from) => { const k = key(i, l); if (best.has(k) && best.get(k) <= c) return; best.set(k, c); prev.set(k, from); pq.push([c, i, l]); };
  for (const o of oc) for (const e of ADJ[o.i]) push(walkS(o.m) + WAIT, o.i, e.line, { start: o });
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]); const [c, i, l] = pq.shift();
    if (best.get(key(i, l)) < c) continue;
    for (const e of ADJ[i]) {
      if (e.line === l) push(c + e.s + DWELL, e.b, l, { i, l });
      else push(c + TRANSFER + CHANGE_PENALTY, i, e.line, { i, l, transfer: true });
    }
  }
  const ends = [];
  for (const d of dc) for (const l of new Set(ADJ[d.i].map(e => e.line))) { const k = key(d.i, l); if (best.has(k)) ends.push({ cost: best.get(k) + walkS(d.m), i: d.i, l, d }); }
  // no tiene sentido coger el metro si andando se llega antes
  const direct = walkS(dist(O, D));
  ends.sort((a, b) => a.cost - b.cost);
  const out = [], sigs = new Set();
  for (const end of ends) {
    // reconstruir
    const chain = []; let k = key(end.i, end.l), start = null, guard = 0;
    while (k && guard++ < 500) { const [i, l] = k.split('|'); chain.unshift({ i: +i, l }); const p = prev.get(k); if (!p) break; if (p.start) { start = p.start; break; } k = key(p.i, p.l); }
    if (!start) continue;
    const legs = []; let t = startMs;
    const wm = Math.max(1, Math.round(walkS(start.m) / 60));
    legs.push({ mode: 'WALK', min: wm, dist: Math.round(start.m), fromLL: O, toLL: [ST[start.i][1], ST[start.i][2]], to: ST[start.i][0], dep: new Date(t).toISOString(), arr: new Date(t + wm * 60000).toISOString() });
    t += wm * 60000 + WAIT * 1000;
    let seg = null;
    const flush = () => { if (seg && seg.path.length > 1) {
        const a = seg.path[0], b = seg.path[seg.path.length - 1], secs = seg.secs;
        legs.push({ mode: 'SUBWAY', line: seg.l, color: M.colors[seg.l] || null, agency: 'Metro de Madrid', headsign: headsign(a, seg.path[1], seg.l) || 'Circular', from: ST[a][0], to: ST[b][0], fromLL: [ST[a][1], ST[a][2]], toLL: [ST[b][1], ST[b][2]], dep: new Date(t).toISOString(), arr: new Date(t + secs * 1000).toISOString(), min: Math.max(1, Math.round(secs / 60)), stops: seg.path.length - 1, inter: seg.path.slice(1, -1).map(i => [ST[i][1], ST[i][2], ST[i][0]]), realTime: false, estimated: true });
        t += secs * 1000 + TRANSFER * 1000; } seg = null; };
    for (let j = 0; j < chain.length; j++) {
      const c = chain[j];
      if (!seg || seg.l !== c.l) { flush(); seg = { l: c.l, path: [c.i], secs: 0 }; continue; }
      if (seg.path[seg.path.length - 1] !== c.i) { const e = ADJ[seg.path[seg.path.length - 1]].find(x => x.b === c.i && x.line === c.l); seg.secs += (e ? e.s : 120) + DWELL; seg.path.push(c.i); }
    }
    flush();
    if (legs.length < 2) continue;
    t -= TRANSFER * 1000;
    const em = Math.max(1, Math.round(walkS(end.d.m) / 60));
    legs.push({ mode: 'WALK', min: em, dist: Math.round(end.d.m), fromLL: [ST[end.i][1], ST[end.i][2]], toLL: D, from: ST[end.i][0], dep: new Date(t).toISOString(), arr: new Date(t + em * 60000).toISOString() });
    t += em * 60000;
    const sig = legs.filter(x => x.mode === 'SUBWAY').map(x => x.line + x.from + x.to).join('>');
    if (sigs.has(sig)) continue; sigs.add(sig);
    if ((t - startMs) / 1000 > direct * 0.95) continue;
    out.push({ min: Math.round((t - startMs) / 60000), start: new Date(startMs).toISOString(), end: new Date(t).toISOString(), transfers: legs.filter(x => x.mode === 'SUBWAY').length - 1, legs, fuente: 'metro' });
    if (out.length >= 2) break;
  }
  return out;
}
