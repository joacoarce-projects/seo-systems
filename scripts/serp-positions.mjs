import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// buscar creds recursivamente
let user, pass;
const walk = (o) => { for (const k in o) { if (typeof o[k] === 'object' && o[k]) walk(o[k]);
  else if (k === 'DATAFORSEO_USERNAME') user = o[k]; else if (k === 'DATAFORSEO_PASSWORD') pass = o[k]; } };
walk(cfg);
const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

const KWS = [
  'paginas web','crear pagina web','diseño web','agencia seo','diseño de paginas web',
  'paginas web chile','diseño web chile','diseño pagina web','agencias de diseño web',
  'agencia seo chile','marketing digital chile','seo chile','agencia diseño web',
  'servicios seo','desarrollo web chile','agencia digital chile','diseño web profesional',
  'posicionamiento web chile','agencia de diseño web','diseño web temuco',
  'diseño web viña del mar','paginas web concepcion','paginas web temuco',
  'diseño web santiago','agencia de desarrollo web','mantencion web'
];

const TARGET = 'rocketmedia.cl';
const out = [];

for (const kw of KWS) {
  const body = [{ keyword: kw, location_name: 'Chile', language_code: 'es', device: 'desktop', depth: 100 }];
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json();
    const task = j.tasks?.[0];
    const items = task?.result?.[0]?.items || [];
    const organics = items.filter(i => i.type === 'organic');
    const hit = organics.find(i => (i.domain || '').replace(/^www\./,'') === TARGET);
    const aio = items.find(i => i.type === 'ai_overview');
    const aioRef = aio ? JSON.stringify(aio).includes(TARGET) : false;
    out.push({
      kw,
      pos: hit ? hit.rank_group : null,
      pos_abs: hit ? hit.rank_absolute : null,
      url: hit ? hit.url : null,
      aio_present: !!aio,
      aio_cites_rm: aioRef
    });
    console.error(`ok: ${kw} -> ${hit ? hit.rank_group : '—'}`);
  } catch (e) {
    out.push({ kw, error: String(e) });
    console.error(`ERR: ${kw} ${e}`);
  }
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
// tabla resumen a stdout
console.log('\n| Keyword | Pos | URL | AIO |');
console.log('|---|---|---|---|');
for (const o of out) {
  const url = o.url ? o.url.replace('https://rocketmedia.cl','') : '—';
  const aio = o.aio_present ? (o.aio_cites_rm ? 'sí+cita' : 'sí') : '—';
  console.log(`| ${o.kw} | ${o.pos ?? '>100'} | ${url} | ${aio} |`);
}
