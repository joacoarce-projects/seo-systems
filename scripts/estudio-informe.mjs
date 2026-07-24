/**
 * Convierte la medición del Estudio Rocket en agregados + tabla markdown.
 *
 * Regla del estudio: solo se reporta lo medido. Los sitios cuya medición falló
 * quedan EXCLUIDOS de los promedios y se declaran aparte, en vez de contarlos
 * como ceros (eso inflaría el hallazgo hacia donde nos conviene).
 *
 * Uso: node estudio-informe.mjs <medicion.json> [salida.md]
 */
import fs from 'node:fs';

const file = process.argv[2];
const outMd = process.argv[3];
if (!file) { console.error('Uso: node estudio-informe.mjs <medicion.json> [salida.md]'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const num = (arr) => arr.filter((x) => typeof x === 'number' && !Number.isNaN(x));
const media = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const mediana = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const movil = num(data.map((s) => s.movil?.score));
const esc = num(data.map((s) => s.escritorio?.score));
const grados = data.map((s) => s.seguridad?.grade).filter(Boolean);
const pesos = num(data.map((s) => s.movil?.pesoKb));

const ORDEN = ['A+', 'A', 'B', 'C', 'D', 'E', 'F'];
const porGrado = Object.fromEntries(ORDEN.map((g) => [g, grados.filter((x) => x === g).length]));
const reprobados = grados.filter((g) => ['D', 'E', 'F'].includes(g)).length;
const movilMalos = movil.filter((s) => s < 50).length;
const movilBuenos = movil.filter((s) => s >= 90).length;

// Cabecera más ausente: el dato accionable para la pieza de contenido.
const faltas = {};
for (const s of data) for (const f of s.seguridad?.faltan ?? []) faltas[f] = (faltas[f] ?? 0) + 1;
const faltasOrden = Object.entries(faltas).sort((a, b) => b[1] - a[1]);

const fallidos = data.filter((s) => s.movil?.error || s.escritorio?.error || s.seguridad?.error);

const resumen = {
  n_muestra: data.length,
  n_con_movil: movil.length,
  n_con_escritorio: esc.length,
  n_con_seguridad: grados.length,
  movil: { media: media(movil), mediana: mediana(movil), min: Math.min(...movil), max: Math.max(...movil) },
  escritorio: { media: media(esc), mediana: mediana(esc), min: Math.min(...esc), max: Math.max(...esc) },
  movil_bajo_50: movilMalos,
  movil_sobre_90: movilBuenos,
  seguridad_por_grado: porGrado,
  seguridad_reprobados_DEF: reprobados,
  peso_movil_kb: { media: media(pesos), mediana: mediana(pesos), max: pesos.length ? Math.max(...pesos) : null },
  cabecera_mas_ausente: faltasOrden[0] ?? null,
  faltantes_ranking: faltasOrden,
  sitios_con_medicion_incompleta: fallidos.map((s) => s.domain),
};

console.log(JSON.stringify(resumen, null, 2));

if (outMd) {
  const L = [];
  L.push('| Sitio | Nicho | Pos. Google | Móvil | Escritorio | Seguridad |');
  L.push('|---|---|---:|---:|---:|:--:|');
  for (const s of [...data].sort((a, b) => (a.movil?.score ?? 999) - (b.movil?.score ?? 999))) {
    const m = s.movil?.score ?? 'sin dato';
    const e = s.escritorio?.score ?? 'sin dato';
    const g = s.seguridad?.grade ?? 'sin dato';
    L.push(`| ${s.domain} | ${s.nicho} | ${s.pos} | ${m} | ${e} | ${g} |`);
  }
  L.push('');
  L.push(`**Muestra**: ${resumen.n_muestra} sitios · **con dato de rendimiento móvil**: ${resumen.n_con_movil} · **con dato de seguridad**: ${resumen.n_con_seguridad}`);
  L.push(`**Móvil**: mediana ${resumen.movil.mediana}, rango ${resumen.movil.min} a ${resumen.movil.max}. ${movilMalos} bajo 50, ${movilBuenos} sobre 90.`);
  L.push(`**Seguridad**: ${reprobados} de ${grados.length} en D, E o F.`);
  if (faltasOrden.length) L.push(`**Cabecera más ausente**: ${faltasOrden[0][0]} (falta en ${faltasOrden[0][1]} de ${grados.length}).`);
  if (fallidos.length) L.push(`**Medición incompleta** (excluidos de los promedios que corresponda): ${fallidos.map((s) => s.domain).join(', ')}.`);
  fs.writeFileSync(outMd, L.join('\n') + '\n');
  console.error(`\nTabla → ${outMd}`);
}
