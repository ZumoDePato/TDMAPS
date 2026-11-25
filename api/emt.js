// API sencilla para la web app: /api/emt?tool=llegadas&parada=72&key=...
import { TOOLS, checkKey } from './_emt.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-key');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!checkKey(req)) { res.status(401).json({ error: 'Clave incorrecta' }); return; }
  const u = new URL(req.url, 'http://localhost');
  const t = TOOLS.find(x => x.name === u.searchParams.get('tool'));
  if (!t) { res.status(400).json({ error: 'Herramienta desconocida' }); return; }
  const args = {};
  for (const [k, v] of u.searchParams) if (k !== 'tool' && k !== 'key') args[k] = /^-?\d+(\.\d+)?$/.test(v) && k !== 'parada' ? Number(v) : v;
  try { res.status(200).json(await t.run(args)); }
  catch (e) { res.status(502).json({ error: e.message }); }
}
