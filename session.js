/**
 * session.js — identité anonyme, signée, sans compte à créer.
 * Le panier et les favoris sont rattachés à ce jeton côté serveur : fermer
 * l’onglet ne fait rien perdre tant que le cookie reste présent.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, cookie } from './http.js';

const SECRET_FILE = path.join(DATA_DIR, '.session-secret');

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch { /* première exécution */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

const SECRET = loadSecret();
const sign = (value) => crypto.createHmac('sha256', SECRET).update(value).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const COOKIE = 'mn_session';

/** Renvoie le jeton de session, en le créant si nécessaire. */
export function session(req, res) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));

  if (raw) {
    const value = decodeURIComponent(raw.slice(COOKIE.length + 1));
    const idx = value.lastIndexOf('.');
    const token = value.slice(0, idx);
    const mac = value.slice(idx + 1);
    if (token && mac && safeEqual(mac, sign(token))) return token;
  }

  const token = crypto.randomUUID();
  const current = res.getHeader('Set-Cookie');
  const next = cookie(COOKIE, `${token}.${sign(token)}`);
  res.setHeader('Set-Cookie', current ? [].concat(current, next) : next);
  return token;
}
