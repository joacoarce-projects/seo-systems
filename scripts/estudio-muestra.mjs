/**
 * Arma el marco muestral del "Estudio Rocket" desde SERPs reales de Chile.
 *
 * Por qué SERP y no un top de tráfico: el estudio habla de PYMES de servicios,
 * que es el mercado de Rocket Media. Un ranking de los sitios más visitados de
 * Chile lo dominarían bancos, retail y medios, que están bien construidos y no
 * son el cliente. Los que compiten por una keyword comercial de servicio SÍ lo son.
 *
 * Uso: node estudio-muestra.mjs <ruta .mcp.json> <salida.json>
 * Costo: 1 llamada SERP por nicho (~$0,002 c/u en DataForSEO).
 */
import fs from 'node:fs';

const cfgPath = process.argv[2];
const outPath = process.argv[3];
if (!cfgPath || !outPath) {
  console.error('Uso: node estudio-muestra.mjs <.mcp.json> <salida.json>');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
let user, pass;
const walk = (o) => {
  for (const k in o) {
    if (typeof o[k] === 'object' && o[k]) walk(o[k]);
    else if (k === 'DATAFORSEO_USERNAME') user = o[k];
    else if (k === 'DATAFORSEO_PASSWORD') pass = o[k];
  }
};
walk(cfg);
const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Nichos alineados al ICP de Rocket Media: servicios con ticket sobre $100k.
const NICHOS = [
  { nicho: 'Climatización', kw: 'empresa de climatizacion' },
  { nicho: 'Salud dental', kw: 'clinica dental providencia' },
  { nicho: 'Legal', kw: 'estudio juridico laboral chile' },
  { nicho: 'Construcción', kw: 'constructora casas chile' },
  { nicho: 'Energía solar', kw: 'instalacion paneles solares chile' },
  { nicho: 'Contabilidad', kw: 'estudio contable pymes chile' },
];

// Fuera del marco: agregadores, directorios, marketplaces y multinacionales. El
// estudio mide sitios de empresas chilenas, no portales de terceros.
const EXCLUIR = [
  'habitissimo', 'doctoralia', 'paginasamarillas', 'amarillas', 'yapo', 'mercadolibre',
  'facebook', 'instagram', 'linkedin', 'youtube', 'wikipedia', 'google', 'blogspot',
  'eulen.com', 'indeed', 'computrabajo', 'emol', 'latercera', 'sii.cl', 'gob.cl',
  'elaireacondicionado', 'cylex', 'infoisinfo', 'guiaempresas', 'clasificados',
];

const esCandidato = (dom) => {
  const d = (dom || '').replace(/^www\./, '').toLowerCase();
  if (!d.endsWith('.cl')) return false; // empresa chilena
  return !EXCLUIR.some((x) => d.includes(x));
};

const out = [];
for (const { nicho, kw } of NICHOS) {
  const body = [{ keyword: kw, location_name: 'Chile', language_code: 'es', device: 'desktop', depth: 20 }];
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const items = j.tasks?.[0]?.result?.[0]?.items || [];
    const cands = items
      .filter((i) => i.type === 'organic' && esCandidato(i.domain))
      .map((i) => ({
        nicho,
        kw,
        pos: i.rank_group,
        domain: (i.domain || '').replace(/^www\./, ''),
        url: `https://${i.domain}`,
        title: i.title,
      }));
    // Dedup por dominio y nos quedamos con los 3 mejor posicionados del nicho.
    const vistos = new Set();
    const top = cands.filter((c) => !vistos.has(c.domain) && vistos.add(c.domain)).slice(0, 3);
    out.push(...top);
    console.error(`ok  ${nicho}: ${top.length} sitios (${top.map((t) => t.domain).join(', ')})`);
  } catch (e) {
    console.error(`ERR ${nicho}: ${e.message}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.error(`\nMuestra: ${out.length} sitios en ${NICHOS.length} nichos → ${outPath}`);
console.error(`Costo estimado DataForSEO: ~$${(NICHOS.length * 0.002).toFixed(3)} USD`);
