// Lógica compartida con la API de la EMT (MobilityLabs). Los archivos que empiezan por _ no son rutas en Vercel.
const BASE = 'https://openapi.emtmadrid.es/';
let token = null;
let tokenExp = 0;

async function login() {
  const email = process.env.EMT_EMAIL, password = process.env.EMT_PASSWORD;
  if (!email || !password) throw new Error('Faltan EMT_EMAIL o EMT_PASSWORD en las variables de entorno de Vercel.');
  const r = await fetch(BASE + 'v1/mobilitylabs/user/login/', { headers: { email, password } });
  const j = await r.json().catch(() => ({}));
  const d = j && j.data && j.data[0];
  if (!d || !d.accessToken) throw new Error('No se pudo iniciar sesión en MobilityLabs (código ' + (j && j.code) + '). Revisa el correo, la contraseña y que la cuenta esté activada.');
  token = d.accessToken;
  const secs = Number(d.tokenSecExpiration) || 3600;
  tokenExp = Date.now() + Math.max(60, secs - 300) * 1000;
  return token;
}

async function emt(method, path, body, retry = true) {
  if (!token || Date.now() > tokenExp) await login();
  const r = await fetch(BASE + path, {
    method,
    headers: { accessToken: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (retry && (r.status === 401 || j.code === '80')) { token = null; return emt(method, path, body, false); }
  if (j.code === '98') throw new Error('Se ha superado el límite de uso de la API de la EMT. Prueba más tarde.');
  return j;
}

const id = v => String(v).replace(/[^0-9]/g, '');
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const TOOLS = [
  {
    name: 'paradas_cercanas',
    description: 'Paradas de autobús de la EMT cerca de unas coordenadas, con sus líneas y la distancia. Úsala para encontrar el número de parada de un sitio de Madrid.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitud, p. ej. 40.4168' },
        lon: { type: 'number', description: 'Longitud, p. ej. -3.7038' },
        radio_m: { type: 'number', description: 'Radio en metros (por defecto 300, máximo 1000)' },
      },
      required: ['lat', 'lon'],
    },
    async run({ lat, lon, radio_m }) {
      const r = Math.min(1000, Math.max(50, Math.round(num(radio_m, 300))));
      const j = await emt('GET', `v2/transport/busemtmad/stops/arroundxy/${num(lon)}/${num(lat)}/${r}/`);
      return (j.data || []).slice(0, 15).map(s => ({
        parada: s.stopId,
        nombre: s.stopName,
        direccion: (s.address || '').trim(),
        distancia_m: s.metersToPoint,
        coordenadas: s.geometry && s.geometry.coordinates && { lat: s.geometry.coordinates[1], lon: s.geometry.coordinates[0] },
        lineas: (s.lines || []).map(l => ({ linea: l.label, hacia: l.to === 'A' ? l.nameA : l.to === 'B' ? l.nameB : (l.headerB || l.nameB) })).filter(l => l.linea),
      }));
    },
  },
  {
    name: 'llegadas',
    description: 'Tiempos de llegada en tiempo real a una parada de la EMT (minutos por línea) y posición de cada autobús.',
    inputSchema: {
      type: 'object',
      properties: { parada: { type: 'string', description: 'Número de parada de la EMT, p. ej. "72"' } },
      required: ['parada'],
    },
    async run({ parada }) {
      const p = id(parada);
      if (!p) throw new Error('Necesito el número de parada.');
      const j = await emt('POST', `v2/transport/busemtmad/stops/${p}/arrives/`, {
        stopId: p, cultureInfo: 'ES', Text_StopRequired_YN: 'Y', Text_EstimationsRequired_YN: 'Y', Text_IncidencesRequired_YN: 'N',
      });
      const d = (j.data && j.data[0]) || {};
      const stop = (d.StopInfo && d.StopInfo[0]) || {};
      return {
        parada: p,
        nombre: stop.stopName || stop.Description || null,
        hora: new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }),
        llegadas: (d.Arrive || []).map(a => ({
          linea: String(a.line),
          destino: a.destination,
          minutos: a.estimateArrive >= 999999 ? null : Math.floor(Number(a.estimateArrive) / 60),
          distancia_m: a.DistanceBus,
          bus: a.bus,
          posicion: a.geometry && a.geometry.coordinates && { lat: a.geometry.coordinates[1], lon: a.geometry.coordinates[0] },
        })),
      };
    },
  },
  {
    name: 'info_parada',
    description: 'Información de una parada de la EMT: nombre, dirección, coordenadas y líneas con sus cabeceras y frecuencias.',
    inputSchema: {
      type: 'object',
      properties: { parada: { type: 'string', description: 'Número de parada de la EMT' } },
      required: ['parada'],
    },
    async run({ parada }) {
      const p = id(parada);
      const j = await emt('GET', `v1/transport/busemtmad/stops/${p}/detail/`);
      const s = (j.data && j.data[0] && j.data[0].stops && j.data[0].stops[0]) || null;
      if (!s) throw new Error('No encuentro la parada ' + p + ' (código ' + j.code + ').');
      return {
        parada: p,
        nombre: s.name,
        direccion: s.postalAddress,
        coordenadas: s.geometry && { lat: s.geometry.coordinates[1], lon: s.geometry.coordinates[0] },
        lineas: (s.dataLine || []).map(l => ({ linea: l.label, de: l.headerA, a: l.headerB, frecuencia_min: [l.minFreq, l.maxFreq], horario: [l.startTime, l.stopTime], dia: l.dayType })),
      };
    },
  },
];


export const checkKey = req => { const k = process.env.MCP_KEY; if (!k) return true; const u = new URL(req.url, 'http://localhost'); return u.searchParams.get('key') === k || req.headers['x-key'] === k; };
