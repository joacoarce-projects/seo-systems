/**
 * Reintenta SOLO las mediciones que fallaron en estudio-medir.mjs.
 *
 * Por qué existe: PSI/Lighthouse falla por su cuenta a veces, incluso en sitios
 * rápidos (evidencia registrada en L5-E1-rocket-scan/src/lib/engine/psi.ts:
 * rocketmedia.cl saca 99 y PSI le dio error 2 de 3 veces). Anotar un timeout de
 * PSI como si el sitio fuera lento mete un dato falso en el estudio.
 *
 * Uso: node estudio-reintentar.mjs <medicion.json> [intentos]
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const MAX = Number(process.argv[3] || 3);
if (!file) { console.error('Uso: node estudio-reintentar.mjs <medicion.json> [intentos]'); process.exit(1); }

const devVars = path.resolve('../L5-E1-rocket-scan/.dev.vars');
const PSI_KEY = fs.readFileSync(devVars, 'utf8').match(/^PSI_API_KEY="?([^"\n]+)"?/m)[1];

const CHECKS = [
  { label: 'HSTS', has: (h) => h.has('strict-transport-security'), penalty: 15 },
  { label: 'Content-Security-Policy', has: (h) => h.has('content-security-policy'), penalty: 20 },
  { label: 'X-Content-Type-Options', has: (h) => h.has('x-content-type-options'), penalty: 10 },
  { label: 'X-Frame-Options / frame-ancestors',
    has: (h) => h.has('x-frame-options') || (h.get('content-security-policy') ?? '').includes('frame-ancestors'), penalty: 10 },
  { label: 'Referrer-Policy', has: (h) => h.has('referrer-policy'), penalty: 10 },
];
const gradeFor = (falt) => {
  const p = falt.reduce((s, c) => s + c.penalty, 0);
  return p === 0 ? 'A+' : p <= 10 ? 'A' : p <= 20 ? 'B' : p <= 35 ? 'C' : p <= 45 ? 'D' : p <= 55 ? 'E' : 'F';
};

async function medirSeguridad(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; RocketScan/1.0; +https://auditor.rocketmedia.cl)' },
      signal: AbortSignal.timeout(30_000),
    });
    const h = res.headers;
    const faltan = CHECKS.filter((c) => !c.has(h));
    return { status: res.status, https: new URL(res.url || url).protocol === 'https:',
      grade: gradeFor(faltan), faltan: faltan.map((c) => c.label),
      cms: (h.get('x-powered-by') || h.get('server') || '').slice(0, 40) || null };
  } catch (e) { return { error: e.message.slice(0, 80) }; }
}

async function medirPsi(url, strategy) {
  const api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    + `?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${PSI_KEY}`;
  const r = await fetch(api, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const lr = j.lighthouseResult, audits = lr?.audits ?? {};
  const crux = j.loadingExperience?.metrics ?? null;
  return {
    score: lr?.categories?.performance?.score != null ? Math.round(lr.categories.performance.score * 100) : null,
    fcp: audits['first-contentful-paint']?.displayValue ?? null,
    lcp: audits['largest-contentful-paint']?.displayValue ?? null,
    cls: audits['cumulative-layout-shift']?.displayValue ?? null,
    tbt: audits['total-blocking-time']?.displayValue ?? null,
    pesoKb: audits['total-byte-weight']?.numericValue != null ? Math.round(audits['total-byte-weight'].numericValue / 1024) : null,
    cruxLcpMs: crux?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    cruxInpMs: crux?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    cruxVeredicto: j.loadingExperience?.overall_category ?? null,
  };
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let arreglados = 0, persisten = 0;

for (const s of data) {
  for (const campo of ['movil', 'escritorio']) {
    if (!s[campo]?.error) continue;
    const strategy = campo === 'movil' ? 'mobile' : 'desktop';
    for (let intento = 1; intento <= MAX; intento++) {
      try {
        s[campo] = await medirPsi(s.url, strategy);
        console.error(`fix ${s.domain} ${campo} -> ${s[campo].score} (intento ${intento})`);
        arreglados++;
        break;
      } catch (e) {
        if (intento === MAX) {
          s[campo] = { error: e.message.slice(0, 80), intentos: MAX };
          console.error(`XX  ${s.domain} ${campo} sigue fallando tras ${MAX} intentos: ${e.message.slice(0, 50)}`);
          persisten++;
        } else {
          await new Promise((r) => setTimeout(r, 5000 * intento));
        }
      }
    }
  }
  if (s.seguridad?.error) {
    const seg = await medirSeguridad(s.url);
    if (!seg.error) { s.seguridad = seg; console.error(`fix ${s.domain} seguridad -> ${seg.grade}`); arreglados++; }
    else { console.error(`XX  ${s.domain} seguridad sigue fallando`); persisten++; }
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.error(`\nRecuperadas: ${arreglados} · Persisten: ${persisten}`);
