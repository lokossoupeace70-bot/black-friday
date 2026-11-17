/**
 * http.js — primitives HTTP minimales pour un site rendu côté serveur.
 * Rien à voir avec l’approche JSON de l’autre boutique : ici on renvoie du HTML,
 * on lit des formulaires classiques et on redirige (POST → redirection → GET).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.join(ROOT, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ échappement */

export function h(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Échappement destiné à un contexte attributaire (class, data-*). */
export const attr = (value) => h(value).replace(/`/g, '&#96;');

/* ------------------------------------------------------------------ réponses */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
};

export function html(res, status, body, headers = {}) {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(res.req.method === 'HEAD' ? undefined : buf);
}

export function redirect(res, location, { status = 303, cookies = [] } = {}) {
  res.writeHead(status, {
    Location: location,
    'Content-Length': 0,
    ...SECURITY_HEADERS,
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  });
  res.end();
}

export function notFound(res, body = '<h1>404 — page introuvable</h1>') {
  html(res, 404, body);
}

/* -------------------------------------------------------------------- cookies */

export function cookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge = 60 * 60 * 24 * 180, path: p = '/', sameSite = 'Lax', httpOnly = true } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, `Max-Age=${maxAge}`, `SameSite=${sameSite}`];
  if (httpOnly) bits.push('HttpOnly');
  return bits.join('; ');
}

/* ------------------------------------------------------------------ formulaires */

const MAX_BODY = 512 * 1024;

/** Lit un corps de formulaire ou de JSON et renvoie un objet plat. */
export async function form(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');

  if (type.includes('application/json')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? flatten(parsed) : {};
    } catch {
      throw new HttpError(400, 'JSON invalide');
    }
  }

  const out = {};
  for (const [key, value] of new URLSearchParams(text)) out[key] = value;
  return out;
}

const flatten = (obj, prefix = '') => Object.entries(obj).reduce((acc, [key, value]) => {
  const composed = prefix ? `${prefix}.${key}` : key;
  if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(acc, flatten(value, composed));
  else if (Array.isArray(value)) acc[composed] = value.map(String).join(',');
  else acc[composed] = value == null ? '' : String(value);
  return acc;
}, {});

/* ---------------------------------------------------------------------- erreurs */

export class HttpError extends Error {
  constructor(status, message, { fields = null } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

/* -------------------------------------------------------------------- routeur */

/**
 * Routeur à table déclarative. Le motif `/produit/:slug` accepte aussi les
 * segments optionnels `:slug?`, ce qui permet de déclarer la page d’accueil
 * comme un motif vide.
 */
export function createRouter() {
  const table = [];
  const add = (method, pattern, handler) => {
    const names = [];
    const source = pattern
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        // Segment littéral : il doit correspondre à la lettre, pas capturer.
        if (!segment.startsWith(':')) {
          return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
        }
        const optional = segment.endsWith('?');
        names.push(segment.replace(/^:/, '').replace(/\?$/, ''));
        return optional ? `(?:/([^/]+))?` : '/([^/]+)';
      })
      .join('');
    table.push({ method, regex: new RegExp(`^${source || '/'}/?$`), names, handler, pattern });
    return api;
  };

  const api = {
    add,
    get: (p, fn) => add('GET', p, fn),
    post: (p, fn) => add('POST', p, fn),
    table,
    match(method, pathname) {
      let pathMatched = false;
      for (const entry of table) {
        const match = entry.regex.exec(pathname);
        if (!match) continue;
        pathMatched = true;
        if (entry.method !== method) continue;
        const params = {};
        entry.names.forEach((name, i) => { params[name] = match[i + 1] ? decodeURIComponent(match[i + 1]) : undefined; });
        return { handler: entry.handler, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
  return api;
}

/* ------------------------------------------------------------------ statiques */

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

export async function staticFile(req, res, pathname) {
  const target = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(pathname)));
  if (!target.startsWith(PUBLIC_DIR)) return false;
  let stat;
  try { stat = await fs.promises.stat(target); } catch { return false; }
  if (!stat.isFile()) return false;

  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return true; }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    ETag: etag,
    // Revalidation systématique : jamais de CSS/JS périmé côté visiteur.
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(target);
    stream.on('error', reject);
    stream.on('close', resolve);
    stream.pipe(res);
  });
  return true;
}

/* ----------------------------------------------------------------------- divers */

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Générateur déterministe : la même référence produit produit toujours le même visuel. */
export function hashInt(text) {
  return parseInt(crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 8), 16) >>> 0;
}

export const slugify = (text) => String(text)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Le montant est stocké en centimes partout ; les vues ne font que l’afficher. */
export const euros = (cents) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
}).format((cents || 0) / 100);
