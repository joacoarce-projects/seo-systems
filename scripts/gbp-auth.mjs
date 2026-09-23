#!/usr/bin/env node
/**
 * gbp-auth.mjs — autoriza UNA vez contra Google Business Profile y guarda el refresh token.
 * Después, lista las cuentas y fichas visibles como smoke test.
 *
 * ⚠️ NO VALIDADO. No se puede correr hasta que Google apruebe el Basic API Access
 * (paso 2 de docs/13-gbp-api-setup.md). Sin aprobación, las APIs ni siquiera se
 * pueden habilitar en el proyecto y esto devolverá 403.
 *
 * Uso:
 *   node seo-systems/scripts/gbp-auth.mjs           # flujo de autorización
 *   node seo-systems/scripts/gbp-auth.mjs --list    # solo listar con el token guardado
 *
 * Reutiliza el OAuth client de escritorio que ya existe para GSC
 * (proyecto seo-system-rocket, project number 491637307270).
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CRED = path.join(ROOT, 'gsc-oauth-credentials.json');
const TOKEN = path.join(ROOT, 'gbp-token.json');
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

const cred = JSON.parse(fs.readFileSync(CRED, 'utf8'));
const { client_id, client_secret } = cred.installed || cred.web;

const exchange = async (params) => {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id, client_secret, ...params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${j.error}: ${j.error_description || ''}`);
  return j;
};

/** Levanta un server efímero en localhost, abre el consentimiento y espera el ?code. */
async function authorize() {
  const port = await new Promise((res) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
  const redirect_uri = `http://localhost:${port}`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id, redirect_uri, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent',
  });

  console.log('\nAbre esta URL y autoriza con la cuenta ADMINISTRADORA de las fichas:\n\n' + url + '\n');
  exec(`start "" "${url}"`, () => {});

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirect_uri);
      const c = u.searchParams.get('code');
      const e = u.searchParams.get('error');
      res.end(c ? 'Listo. Puedes cerrar esta pestaña.' : `Error: ${e}`);
      server.close();
      c ? resolve(c) : reject(new Error(e || 'sin code'));
    });
    server.listen(port, '127.0.0.1');
    setTimeout(() => { server.close(); reject(new Error('timeout esperando el consentimiento')); }, 180000);
  });

  const tok = await exchange({ code, redirect_uri, grant_type: 'authorization_code' });
  if (!tok.refresh_token) throw new Error('Google no devolvió refresh_token. Revoca el acceso previo y reintenta.');
  fs.writeFileSync(TOKEN, JSON.stringify(tok, null, 1));
  console.log('→ refresh token guardado en gbp-token.json (ignorado por git)');
  return tok.access_token;
}

async function accessToken() {
  if (!fs.existsSync(TOKEN)) return authorize();
  const { refresh_token } = JSON.parse(fs.readFileSync(TOKEN, 'utf8'));
  const t = await exchange({ refresh_token, grant_type: 'refresh_token' });
  return t.access_token;
}

const api = async (host, pathname, token) => {
  const r = await fetch(`https://${host}/${pathname}`, { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};

const token = await accessToken();

/** Traduce el fallo del smoke test a "en qué paso del runbook estás". */
function diagnosticar(msg) {
  const linea = (t) => console.log('\n' + t + '\n');
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(msg)) {
    return linea(
      'DIAGNÓSTICO: la API está deshabilitada en el proyecto.\n' +
      'Si todavía no te aprobaron el Basic API Access, esto es lo ESPERADO: las APIs no se\n' +
      'pueden habilitar antes de la aprobación. Paso 2 de docs/13-gbp-api-setup.md.\n' +
      'Si YA te aprobaron, entrá a la biblioteca de APIs y habilitalas (paso 3).');
  }
  if (/RESOURCE_EXHAUSTED|Quota exceeded|rateLimitExceeded/i.test(msg) || /^429/.test(msg)) {
    return linea(
      'DIAGNÓSTICO: cuota agotada — típicamente cuota 0 QPM = solicitud NO aprobada todavía.\n' +
      'Es el síntoma clásico del paso 2 pendiente. Revisá la cuota en Cloud Console.');
  }
  if (/PERMISSION_DENIED|insufficient|ACCESS_TOKEN_SCOPE/i.test(msg) || /^403/.test(msg)) {
    return linea(
      'DIAGNÓSTICO: permiso denegado. Dos causas posibles:\n' +
      ' (a) la solicitud del paso 2 no está aprobada, o\n' +
      ' (b) autorizaste con una cuenta que no es propietaria/administradora de las fichas.\n' +
      'Borrá gbp-token.json y volvé a correr para autorizar con la cuenta correcta.');
  }
  if (/invalid_grant|Token has been expired|revoked/i.test(msg)) {
    return linea(
      'DIAGNÓSTICO: el refresh token venció o fue revocado.\n' +
      'Si la pantalla de consentimiento está en modo Testing (External), los refresh tokens\n' +
      'mueren a los 7 días. Ponela en INTERNAL (requiere Workspace) y volvé a autorizar.\n' +
      'Borrá gbp-token.json y corré este script de nuevo.');
  }
  linea('DIAGNÓSTICO: error no reconocido. El mensaje crudo está arriba.');
}

// Smoke test: cuentas → fichas de cada cuenta.
let accounts;
try {
  accounts = await api('mybusinessaccountmanagement.googleapis.com', 'v1/accounts', token);
} catch (e) {
  console.error('\nFalló el smoke test:', e.message);
  diagnosticar(e.message);
  process.exit(1);
}
console.log('\nCuentas visibles:', (accounts.accounts || []).length);
for (const a of accounts.accounts || []) {
  console.log(`\n· ${a.name} — ${a.accountName} (${a.type})`);
  const fields = 'name,title,storefrontAddress,phoneNumbers,categories,websiteUri,metadata';
  const locs = await api(
    'mybusinessbusinessinformation.googleapis.com',
    `v1/${a.name}/locations?readMask=${fields}&pageSize=100`, token,
  );
  for (const l of locs.locations || []) {
    console.log(`   ${l.name} | ${l.title} | ${l.storefrontAddress?.locality || 's/dirección'} | ${l.categories?.primaryCategory?.displayName || '-'}`);
  }
}
console.log('\nGuarda cada `locations/<id>` en el campo gbp.location_id del _config.json del cliente.');
