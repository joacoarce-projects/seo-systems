#!/usr/bin/env node
/**
 * local-geogrid.mjs — mide la posición en el local_pack de una ficha GBP
 * desplazando la coordenada del buscador. El pack local es proximidad-dominante:
 * una sola medición "desde la oficina" no dice nada sobre el radio real de cobertura.
 *
 * Uso:
 *   node seo-systems/scripts/local-geogrid.mjs --cliente rocketmedia
 *   node seo-systems/scripts/local-geogrid.mjs --cliente rocketmedia --json out.json
 *
 * Lee la config desde clientes/<slug>/state/geogrid.json:
 *   { "match": "Rocket Media", "keywords": [...], "points": [["Viña centro","-33.0245,-71.5518"], ...] }
 *
 * Credenciales: DATAFORSEO_LOGIN / DATAFORSEO_API_PASSWORD en L6-seo/.env
 * Costo medido: ~US$0,002 por (keyword × punto).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

const slug = arg('cliente');
if (!slug) { console.error('Falta --cliente <slug>'); process.exit(1); }

// --config <archivo> en state/ para una grilla alternativa (p. ej. por servicio) sin pisar la base.
const cfgPath = path.join(ROOT, 'clientes', slug, 'state', arg('config', 'geogrid.json'));
if (!fs.existsSync(cfgPath)) { console.error('No existe ' + cfgPath); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const env = loadEnv();
const AUTH = 'Basic ' + Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_API_PASSWORD}`).toString('base64');

const serp = async (keyword, coord) => {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    // la API acepta una sola tarea por request en este endpoint
    body: JSON.stringify([{ keyword, location_coordinate: `${coord},${cfg.radius_km || 10}`, language_code: 'es', device: 'desktop', depth: 20 }]),
  });
  return (await r.json()).tasks?.[0]?.result?.[0];
};

const rows = [];
for (const keyword of cfg.keywords) {
  console.log('\n##### ' + keyword);
  for (const [name, coord] of cfg.points) {
    const res = await serp(keyword, coord);
    const items = res?.items || [];
    const pack = items.filter(i => i.type === 'local_pack');
    const mine = pack.findIndex(i => (i.title || '').includes(cfg.match));
    const org = items.filter(i => i.type === 'organic').findIndex(i => (i.domain || '').includes(cfg.domain || cfg.match.toLowerCase()));
    rows.push({ keyword, point: name, coord, pack_pos: mine >= 0 ? mine + 1 : null, pack: pack.map(i => i.title), organic_abs: org >= 0 ? items.filter(i => i.type === 'organic')[org].rank_absolute : null });
    console.log(
      '  ' + name.padEnd(16) +
      ' | pack: ' + (mine >= 0 ? String(mine + 1) : '-') +
      ' | ' + pack.map((i, x) => (x + 1) + '.' + (i.title || '').slice(0, 30)).join('  ')
    );
  }
}

const outFile = arg('json');
if (outFile) { fs.writeFileSync(outFile, JSON.stringify(rows, null, 1)); console.log('\n→ ' + outFile); }
