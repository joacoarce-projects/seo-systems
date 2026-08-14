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

// Smoke test: cuentas → fichas de cada cuenta.
const accounts = await api('mybusinessaccountmanagement.googleapis.com', 'v1/accounts', token);
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
