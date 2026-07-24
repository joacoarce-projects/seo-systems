/**
 * Mide la muestra del "Estudio Rocket": rendimiento (PageSpeed Insights) +
 * cabeceras de seguridad, con los MISMOS criterios que el auditor de L5-E1-rocket-scan
 * (`src/lib/engine/security.ts`), para que los números sean comparables con lo que
 * ya publicamos en las páginas de servicio.
 *
 * PSI es gratis con API key. Las cabeceras son un fetch. Costo del script: $0.
 *
 * Uso: node estudio-medir.mjs <muestra.json> <salida.json> [PSI_API_KEY]
 *      (si no se pasa la key, la lee de L5-E1-rocket-scan/.dev.vars)
 */
import fs from 'node:fs';
import path from 'node:path';

const muestraPath = process.argv[2];
const outPath = process.argv[3];
let PSI_KEY = process.argv[4];

if (!muestraPath || !outPath) {
  console.error('Uso: node estudio-medir.mjs <muestra.json> <salida.json> [PSI_API_KEY]');
  process.exit(1);
}

if (!PSI_KEY) {
  // La key vive en el .dev.vars del scanner (gitignored). No se imprime nunca.
  const devVars = path.resolve('../L5-E1-rocket-scan/.dev.vars');
  if (fs.existsSync(devVars)) {
    const m = fs.readFileSync(devVars, 'utf8').match(/^PSI_API_KEY="?([^"\n]+)"?/m);
    if (m) PSI_KEY = m[1];
  }
}
if (!PSI_KEY) { console.error('Falta PSI_API_KEY'); process.exit(1); }

// Mismos 5 checks y penalizaciones que engine/security.ts. Si eso cambia, cambiar acá.
const CHECKS = [
  { id: 'hsts', label: 'HSTS', has: (h) => h.has('strict-transport-security'), penalty: 15 },
  { id: 'csp', label: 'Content-Security-Policy', has: (h) => h.has('content-security-policy'), penalty: 20 },
  { id: 'xcto', label: 'X-Content-Type-Options', has: (h) => h.has('x-content-type-options'), penalty: 10 },
  {
    id: 'frame', label: 'X-Frame-Options / frame-ancestors',
    has: (h) => h.has('x-frame-options') || (h.get('content-security-policy') ?? '').includes('frame-ancestors'),
    penalty: 10,
  },
  { id: 'refpol', label: 'Referrer-Policy', has: (h) => h.has('referrer-policy'), penalty: 10 },
];

// Escala de securityheaders.com: A+ solo con las 5; de ahí baja por penalización.
const gradeFor = (falt) => {
  const perdido = falt.reduce((s, c) => s + c.penalty, 0);
  if (perdido === 0) return 'A+';
  if (perdido <= 10) return 'A';
  if (perdido <= 20) return 'B';
  if (perdido <= 35) return 'C';
  if (perdido <= 45) return 'D';
  if (perdido <= 55) return 'E';
  return 'F';
};

async function medirSeguridad(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'RocketScan/1.0 (+https://auditor.rocketmedia.cl)' },
      signal: AbortSignal.timeout(20_000),
    });
    const h = res.headers;
    const faltan = CHECKS.filter((c) => !c.has(h));
    const httpsOk = new URL(res.url || url).protocol === 'https:';
    return {
      status: res.status,
      https: httpsOk,
      grade: gradeFor(faltan),
      faltan: faltan.map((c) => c.label),
      cms: (h.get('x-powered-by') || h.get('server') || '').slice(0, 40) || null,
    };
  } catch (e) {
    return { error: e.message.slice(0, 80) };
  }
}

async function medirPsi(url, strategy) {
  const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    + `?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${PSI_KEY}`;
  try {
    const r = await fetch(api, { signal: AbortSignal.timeout(90_000) });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const j = await r.json();
    const lr = j.lighthouseResult;
    const audits = lr?.audits ?? {};
    // loadingExperience = CrUX, datos de usuarios reales. Puede venir vacío si el
    // sitio no tiene tráfico suficiente: eso también es un dato del estudio.
    const crux = j.loadingExperience?.metrics ?? null;
    return {
      score: lr?.categories?.performance?.score != null ? Math.round(lr.categories.performance.score * 100) : null,
      fcp: audits['first-contentful-paint']?.displayValue ?? null,
      lcp: audits['largest-contentful-paint']?.displayValue ?? null,
      cls: audits['cumulative-layout-shift']?.displayValue ?? null,
      tbt: audits['total-blocking-time']?.displayValue ?? null,
      pesoKb: audits['total-byte-weight']?.numericValue != null
        ? Math.round(audits['total-byte-weight'].numericValue / 1024) : null,
      cruxLcpMs: crux?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
      cruxInpMs: crux?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
      cruxVeredicto: j.loadingExperience?.overall_category ?? null,
    };
  } catch (e) {
    return { error: e.message.slice(0, 80) };
  }
}

const muestra = JSON.parse(fs.readFileSync(muestraPath, 'utf8'));
const out = [];

// Concurrencia baja: PSI tarda 15-40s por llamada y no conviene gatillar su rate limit.
const CONC = 3;
let i = 0;
async function worker() {
  while (i < muestra.length) {
    const idx = i++;
    const s = muestra[idx];
    const [movil, escritorio, seg] = await Promise.all([
      medirPsi(s.url, 'mobile'),
      medirPsi(s.url, 'desktop'),
      medirSeguridad(s.url),
    ]);
    out[idx] = { ...s, movil, escritorio, seguridad: seg };
    console.error(`ok  ${s.domain.padEnd(30)} movil ${String(movil.score ?? movil.error).padEnd(6)} esc ${String(escritorio.score ?? escritorio.error).padEnd(6)} seg ${seg.grade ?? seg.error}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.error(`\n${out.length} sitios medidos → ${outPath}`);
console.error('Costo: $0 (PSI es gratis con API key)');
