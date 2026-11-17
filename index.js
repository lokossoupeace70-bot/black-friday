/**
 * index.js — serveur Maison Noire.
 * Ordre : fichiers statiques → table de routes → page 404 habillée.
 */
import http from 'node:http';
import { createRouter, staticFile, html, form, HttpError, notFound, clamp } from './http.js';
import { routes } from './routes.js';
import { layout } from './views/ui.js';
import { EVENT } from './pricing.js';

const PORT = Number(process.env.PORT) || 4200;
const HOST = process.env.HOST || '127.0.0.1';

const router = createRouter();
for (const route of routes) router.add(route.method, route.pattern, route.handler);

const server = http.createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  let logged = false;
  const log = () => {
    if (logged) return;
    logged = true;
    if (process.env.MN_LOG === 'off') return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${pathname} → ${res.statusCode} (${ms.toFixed(1)} ms)`);
  };

  try {
    // 0. Mutations : on refuse une origine tierce (protection CSRF simple et efficace).
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; }
        if (!sameOrigin) {
          return html(res, 403, layout({
            title: 'Requête refusée',
            body: '<div class="wrap empty"><h1>Requête refusée</h1><p>Cette action doit être déclenchée depuis le site Maison Noire.</p></div>',
          }));
        }
      }
    }

    // 1. Ressources statiques
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname.startsWith('/theme.css') || pathname.startsWith('/admin.css') || pathname.startsWith('/interactions.js')) {
        if (await staticFile(req, res, pathname)) return;
      }
    }

    // 2. Routes applicatives
    const match = router.match(req.method, pathname);
    if (match && match.methodNotAllowed) {
      return html(res, 405, layout({
        title: 'Méthode non autorisée',
        body: '<div class="wrap empty"><h1>405</h1><p>Cette méthode n’est pas acceptée sur cette adresse.</p></div>',
      }));
    }
    if (match) return await match.handler(req, res, match.params, url);

    return notFound(res, layout({
      title: 'Page introuvable',
      body: `<div class="wrap empty">
        <span class="kicker">Erreur 404</span>
        <h1>Cette page n’existe pas.</h1>
        <p>Le lien est peut-être ancien, ou la collection a été retirée du catalogue.</p>
        <a class="btn btn--ink" href="/boutique">Retour à la boutique</a>
      </div>`,
    }));
  } catch (error) {
    if (error instanceof HttpError) {
      return html(res, error.status, layout({
        title: `Erreur ${error.status}`,
        body: `<div class="wrap empty"><h1>Erreur ${error.status}</h1><p>${error.message}</p></div>`,
      }));
    }
    console.error('[maison-noire] erreur inattendue', error);
    return html(res, 500, layout({
      title: 'Erreur serveur',
      body: '<div class="wrap empty"><h1>Une erreur est survenue</h1><p>Nous avons été notifiés. Merci de réessayer dans un instant.</p><a class="btn btn--ink" href="/">Retour à l’accueil</a></div>',
    }));
  } finally {
    log();
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ❦  MAISON NOIRE — boutique Black Friday');
  console.log(`     http://${HOST}:${PORT}`);
  console.log(`     back-office : http://${HOST}:${PORT}/admin  (mot de passe : ${process.env.ADMIN_PASSWORD || 'maisonnoire2026'})`);
  console.log(`     campagne : ${EVENT.name} · clôture le ${EVENT.endsAt.toISOString().slice(0, 10)}`);
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[maison-noire] arrêt du serveur.');
    server.close(() => process.exit(0));
  });
}

export { server, router, clamp, form };
