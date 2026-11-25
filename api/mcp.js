// Servidor MCP (Streamable HTTP, sin estado) que hace de puente con la API de la EMT de Madrid (MobilityLabs).
// Sin dependencias: funciona como función de Vercel con Node 18+.
// Variables de entorno: EMT_EMAIL, EMT_PASSWORD y (recomendado) MCP_KEY.

import { TOOLS } from './_emt.js';

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  if (!msg || typeof msg !== 'object') return fail(null, -32600, 'Petición no válida');
  const { id: rid, method, params } = msg;
  if (rid === undefined || rid === null) return null; // notificación
  switch (method) {
    case 'initialize':
      return ok(rid, {
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'tdmaps-emt', version: '1.0.0' },
        instructions: 'Datos en tiempo real de los autobuses de la EMT de Madrid. Para saber cuándo pasa un bus: busca la parada con paradas_cercanas (o usa su número) y luego llama a llegadas.',
      });
    case 'ping':
      return ok(rid, {});
    case 'tools/list':
      return ok(rid, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const t = TOOLS.find(x => x.name === (params && params.name));
      if (!t) return fail(rid, -32602, 'Herramienta desconocida');
      try {
        const out = await t.run((params && params.arguments) || {});
        return ok(rid, { content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        return ok(rid, { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    }
    default:
      return fail(rid, -32601, 'Método no soportado: ' + method);
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const key = process.env.MCP_KEY;
  if (key && url.searchParams.get('key') !== key) {
    res.status(401).json({ error: 'Clave incorrecta' });
    return;
  }
  if (req.method === 'GET') {
    res.status(405).setHeader('Allow', 'POST').json({ ok: true, servidor: 'tdmaps-emt', info: 'Usa esta URL como conector MCP en Claude.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').end();
    return;
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) { res.status(400).json(fail(null, -32700, 'JSON no válido')); return; }
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!out.length) { res.status(202).end(); return; }
  res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify(batch ? out : out[0]));
}
