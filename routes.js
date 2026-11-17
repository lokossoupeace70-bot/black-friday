/**
 * routes.js — table de routes du site.
 *
 * Toutes les mutations passent par un formulaire POST puis une redirection
 * (POST → redirection → GET). Conséquence : le site fonctionne intégralement
 * sans JavaScript, et un rafraîchissement ne rejoue jamais un ajout au panier.
 */
import { form, redirect, html, notFound, clamp } from './http.js';
import { session } from './session.js';
import { deliveryWindow, totals as computeTotals, validatePromo } from './pricing.js';
import * as store from './store.js';
import * as views from './views/pages.js';
import { layout } from './views/ui.js';
import * as admin from './views/admin.js';
import { studioArt } from './studio.js';

/* --------------------------------------------------------------- utilitaires */

const MESSAGES = {
  ajoute: ['Pièce ajoutée à votre sélection.', 'ok'],
  retire: ['Pièce retirée de votre sélection.', 'ok'],
  quantite: ['Quantité mise à jour.', 'ok'],
  favori: ['Vos favoris ont été mis à jour.', 'ok'],
  promo: ['Code de la Maison appliqué.', 'ok'],
  promoechec: ['Ce code n’a pas pu être appliqué.', 'ko'],
  newsletter: ['Merci — votre code de bienvenue part par e-mail.', 'ok'],
  panier_vide: ['Votre sélection est vide.', 'ko'],
};

/**
 * Message transporté par l’URL, jamais par un cookie : une redirection reste
 * ainsi rejouable sans réafficher deux fois le même bandeau.
 */
function flash(url) {
  const key = url.searchParams.get('msg');
  const detail = url.searchParams.get('detail');
  if (!key && !detail) return { message: null, tone: 'ok' };
  const entry = MESSAGES[key];
  return {
    message: detail || (entry ? entry[0] : null),
    tone: entry ? entry[1] : 'ko',
  };
}

const backTo = (req, fallback) => {
  const referer = req.headers.referer;
  if (!referer) return fallback;
  try {
    const url = new URL(referer);
    if (url.host !== req.headers.host) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
};

function withMessage(path, key, detail = '') {
  const url = new URL(path, 'http://local');
  url.searchParams.set('msg', key);
  if (detail) url.searchParams.set('detail', detail);
  return url.pathname + url.search;
}

/** Contexte commun : session, panier, totaux, promo appliquée. */
function context(req, res, promoCodeOverride = undefined) {
  const token = session(req, res);
  const lines = store.cartLines(token);
  const promoCode = promoCodeOverride !== undefined ? promoCodeOverride : null;
  let promo = promoCode ? store.promoByCode(promoCode) : null;
  if (promo) {
    const check = validatePromo(promo, lines.reduce((s, l) => s + l.lineTotal, 0));
    if (!check.ok) promo = null;
  }
  const giftWrap = false;
  const totals = computeTotals({ lines, promo, giftWrap });

  return {
    token,
    lines,
    promo,
    giftWrap,
    totals,
    wishlist: store.wishlistIds(token),
    cartCount: totals.qty,
  };
}

/* ------------------------------------------------------------------- routes */

export const routes = [
  /* ---------------------------------------------------------- vitrine */
  {
    method: 'GET',
    pattern: '/',
    handler: (req, res) => {
      const ctx = context(req, res);
      const collections = store.collections();
      const featured = store.listProducts({ sort: 'selection', limit: 12 });
      // Une image d’illustration par collection, tirée de sa pièce la plus vendue.
      const withImages = collections.map((collection) => {
        const first = store.listProducts({ collection: collection.slug, limit: 1 })[0];
        return { ...collection, image: first ? first.slug : null };
      });

      return html(res, 200, views.home({
        collections: withImages,
        featured,
        notices: campaignNotices(),
        journal: JOURNAL.slice(0, 3),
        reviews: HOME_REVIEWS,
        wishlist: ctx.wishlist,
        totals: ctx.totals,
        flash: flashOf(req),
      }));
    },
  },

  {
    method: 'GET',
    pattern: '/boutique',
    handler: (req, res, params, url) => {
      const ctx = context(req, res);
      const collection = null;
      const products = store.listProducts({
        q: (url.searchParams.get('q') || '').trim(),
        sort: url.searchParams.get('tri') || 'selection',
        limit: 60,
      });
      return html(res, 200, views.boutique({
        products,
        collections: store.collections(),
        current: collection,
        query: (url.searchParams.get('q') || '').trim(),
        sort: url.searchParams.get('tri') || 'selection',
        wishlist: ctx.wishlist,
        totals: ctx.totals,
        title: 'Toute la boutique',
        lead: 'Vingt-quatre pièces, six collections, une seule fenêtre de quatre jours pour les découvrir au meilleur prix.',
        flash: flashOf(req),
      }));
    },
  },

  {
    method: 'GET',
    pattern: '/collection/:slug',
    handler: (req, res, params, url) => {
      const ctx = context(req, res);
      const collection = store.collectionBySlug(params.slug);
      if (!collection) return notFoundWithChrome(req, res, ctx);
      const products = store.listProducts({
        collection: collection.slug,
        q: (url.searchParams.get('q') || '').trim(),
        sort: url.searchParams.get('tri') || 'selection',
        limit: 40,
      });
      return html(res, 200, views.boutique({
        products,
        collections: store.collections(),
        current: collection,
        query: (url.searchParams.get('q') || '').trim(),
        sort: url.searchParams.get('tri') || 'selection',
        wishlist: ctx.wishlist,
        totals: ctx.totals,
        title: collection.name,
        lead: `${collection.description} ${collection.tagline}`,
        flash: flashOf(req),
      }));
    },
  },

  {
    method: 'GET',
    pattern: '/produit/:slug',
    handler: (req, res, params) => {
      const ctx = context(req, res);
      const product = store.productBySlug(params.slug);
      if (!product) return notFoundWithChrome(req, res, ctx);
      const { message, tone } = flashOf(req);
      return html(res, 200, views.produit({ product, wishlist: ctx.wishlist, totals: ctx.totals, message, tone }));
    },
  },

  {
    method: 'GET',
    pattern: '/journal',
    handler: (req, res) => html(res, 200, views.journal({ articles: JOURNAL, flash: flashOf(req) })),
  },

  {
    method: 'GET',
    pattern: '/maison',
    handler: (req, res) => {
      const ctx = context(req, res);
      return html(res, 200, views.maison({
        totals: ctx.totals,
        stats: [['2014', 'Première collection'], ['2', 'Ateliers partenaires'], ['11 400', 'Pièces réparées'], ['96 %', 'Clients qui recommandent']],
      }));
    },
  },

  /* ------------------------------------------------------------ favoris */
  {
    method: 'GET',
    pattern: '/favoris',
    handler: (req, res) => {
      const ctx = context(req, res);
      return html(res, 200, views.favoris({
        products: store.wishlistProducts(ctx.token),
        wishlist: ctx.wishlist,
        totals: ctx.totals,
        flash: flashOf(req),
      }));
    },
  },

  {
    method: 'POST',
    pattern: '/favoris/basculer',
    handler: async (req, res) => {
      const token = session(req, res);
      const body = await form(req);
      const productId = Number(body.productId);
      const result = store.toggleWish(token, productId);

      // Appel enrichi (fetch) : réponse JSON pour rafraîchir le bouton sans
      // recharger. Formulaire classique : redirection là où était le visiteur.
      if (String(req.headers.accept || '').includes('application/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(result));
        return;
      }
      return redirect(res, withMessage(backTo(req, '/favoris'), 'favori', result.message), { status: 303 });
    },
  },

  /* ------------------------------------------------------------- panier */
  {
    method: 'GET',
    pattern: '/panier',
    handler: (req, res, params, url) => {
      // Le code promo circule dans l’URL de l’étape : rien à stocker côté cookie.
      const ctx = context(req, res, url.searchParams.get('code'));
      const { message, tone } = flashOf(req);
      return html(res, 200, views.panier({
        lines: ctx.lines,
        totals: ctx.totals,
        promo: ctx.promo,
        code: ctx.promo ? ctx.promo.code : '',
        message,
        tone,
      }));
    },
  },

  {
    method: 'POST',
    pattern: '/panier/ajouter',
    handler: async (req, res) => {
      const token = session(req, res);
      const body = await form(req);
      const skuId = Number(body.skuId);
      const qty = clamp(Math.round(Number(body.qty) || 1), 1, 10);

      if (!skuId) return redirect(res, withMessage(backTo(req, '/panier'), 'panier_vide', 'Choisissez une déclinaison.'), { status: 303 });

      const result = store.addToCart(token, skuId, qty);
      const slug = store.skuProductSlug(skuId);
      const target = body.express ? '/commande' : backTo(req, slug ? `/produit/${slug}` : '/panier');
      return redirect(res, result.ok ? target : withMessage(target, 'promoechec', result.message), { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/panier/modifier',
    handler: async (req, res) => {
      const token = session(req, res);
      const body = await form(req);
      const result = store.setLineQty(token, Number(body.lineId), clamp(Number(body.qty) || 0, 0, 10));
      return redirect(res, withMessage(backTo(req, '/panier'), 'quantite', result.ok ? result.message : undefined), { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/panier/supprimer',
    handler: async (req, res) => {
      const token = session(req, res);
      const body = await form(req);
      store.removeLine(token, Number(body.lineId));
      return redirect(res, withMessage('/panier', 'retire'), { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/panier/promo',
    handler: async (req, res) => {
      const token = session(req, res);
      const body = await form(req);
      if (body.remove) return redirect(res, withMessage('/panier', 'retire', 'Code retiré.'), { status: 303 });

      const code = String(body.code || '').trim().toUpperCase();
      const promo = store.promoByCode(code);
      const subtotal = store.cartLines(token).reduce((s, l) => s + l.lineTotal, 0);
      const check = validatePromo(promo, subtotal);
      if (!check.ok) return redirect(res, withMessage('/panier', 'promoechec', check.message), { status: 303 });

      return redirect(res, withMessage(`/panier?code=${encodeURIComponent(code)}`, 'promo', check.message), { status: 303 });
    },
  },

  /* ----------------------------------------------------------- commande */
  {
    method: 'GET',
    pattern: '/commande',
    handler: (req, res, params, url) => {
      const code = url.searchParams.get('code');
      const ctx = context(req, res, code);
      if (!ctx.lines.length) return redirect(res, withMessage('/panier', 'panier_vide'), { status: 303 });

      return html(res, 200, views.commande({
        lines: ctx.lines,
        totals: ctx.totals,
        values: { giftWrap: ctx.giftWrap ? '1' : '' },
        errors: {},
        promo: ctx.promo,
        giftWrap: ctx.giftWrap,
      }));
    },
  },

  {
    method: 'POST',
    pattern: '/commande',
    handler: async (req, res) => {
      const body = await form(req);
      const code = String(body.promoCode || '').trim().toUpperCase();
      const ctx = context(req, res, code || null);

      if (!ctx.lines.length) return redirect(res, withMessage('/panier', 'panier_vide'), { status: 303 });

      const errors = validateCheckout(body);
      const giftWrap = body.giftWrap === '1';
      const giftMessage = String(body.giftMessage || '').slice(0, 240);
      const totals = computeTotals({ lines: ctx.lines, promo: ctx.promo, giftWrap });

      if (Object.keys(errors).length) {
        return html(res, 422, views.commande({
          lines: ctx.lines,
          totals,
          values: body,
          errors: { ...errors, __global: 'Vérifiez les champs signalés ci-dessous.' },
          promo: ctx.promo,
          giftWrap,
        }));
      }

      try {
        const order = store.createOrder({
          token: ctx.token,
          customer: {
            email: body.email, firstName: body.firstName, lastName: body.lastName,
            address: body.address, zip: body.zip, city: body.city,
            country: 'France', phone: body.phone || '',
          },
          totals,
          promoCode: ctx.promo ? ctx.promo.code : '',
          giftWrap,
          giftMessage,
        });
        return redirect(res, `/confirmation/${encodeURIComponent(order.ref)}`, { status: 303 });
      } catch (error) {
        const message = String(error.message || '');
        if (message.startsWith('stock:')) {
          return redirect(res, withMessage('/panier', 'promoechec', `Stock insuffisant sur ${message.slice(6)}.`), { status: 303 });
        }
        return redirect(res, withMessage('/panier', 'promoechec', 'Le panier est vide.'), { status: 303 });
      }
    },
  },

  {
    method: 'GET',
    pattern: '/confirmation/:ref',
    handler: (req, res, params) => {
      const order = store.orderByRef(params.ref);
      if (!order) return notFoundWithChrome(req, res, context(req, res));
      return html(res, 200, views.confirmation({ order, window_: deliveryWindow() }));
    },
  },

  {
    method: 'GET',
    pattern: '/suivi',
    handler: (req, res, params, url) => {
      const ref = (url.searchParams.get('ref') || '').trim();
      const email = (url.searchParams.get('email') || '').trim();
      let order = null;
      let error = null;
      if (ref || email) {
        order = store.orderByRef(ref, email);
        if (!order) error = 'Aucune commande ne correspond à cette référence et à cette adresse e-mail.';
      }
      return html(res, 200, views.suivi({ order, error, ref, email, window_: deliveryWindow() }));
    },
  },

  /* --------------------------------------------------------- newsletter */
  {
    method: 'POST',
    pattern: '/newsletter',
    handler: async (req, res) => {
      const body = await form(req);
      const result = store.subscribeNewsletter(body.email);
      return redirect(res, withMessage(backTo(req, '/'), result.ok ? 'newsletter' : 'promoechec', result.ok ? undefined : result.message), { status: 303 });
    },
  },

  /* -------------------------------------------------------------- visuels */
  {
    method: 'GET',
    pattern: '/studio/:file',
    handler: (req, res, params, url) => {
      const slug = params.file.replace(/\.svg$/i, '');
      const product = store.productBySlug(slug);
      if (!product) return notFound(res, '<h1>Visuel introuvable</h1>');
      const option = url.searchParams.get('v') || '';
      const svg = studioArt({ slug, name: product.name, collectionSlug: product.collection_slug, option });
      const etag = `"${Buffer.byteLength(svg).toString(16)}-${option.length.toString(16)}-${product.id}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
        ETag: etag,
        'Content-Length': Buffer.byteLength(svg),
      });
      res.end(svg);
    },
  },

  /* --------------------------------------------------------------- admin */
  {
    method: 'GET',
    pattern: '/admin',
    handler: (req, res, params, url) => {
      if (!admin.isAuthed(req)) return html(res, 200, admin.login({ error: url.searchParams.get('msg') === 'refuse' }));
      const tab = url.searchParams.get('vue') || 'tableau';
      return html(res, 200, admin.consoleView({
        tab,
        data: store.dashboard(),
        orders: store.listOrders({ status: url.searchParams.get('statut') || '', q: url.searchParams.get('q') || '' }),
        products: store.adminProducts(url.searchParams.get('q') || ''),
        promos: store.allPromos(),
        newsletter: store.newsletterList(),
      }));
    },
  },

  {
    method: 'POST',
    pattern: '/admin/connexion',
    handler: async (req, res) => {
      const body = await form(req);
      const expected = process.env.ADMIN_PASSWORD || 'maisonnoire2026';
      if (String(body.password || '') !== expected) {
        await new Promise((resolve) => setTimeout(resolve, 350)); // freine le bourrage
        return redirect(res, '/admin?msg=refuse', { status: 303 });
      }
      res.setHeader('Set-Cookie', admin.authCookie());
      return redirect(res, '/admin', { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/admin/stock',
    handler: async (req, res) => {
      if (!admin.isAuthed(req)) return redirect(res, '/admin', { status: 303 });
      const body = await form(req);
      store.updateSkuStock(Number(body.skuId), clamp(Number(body.stock) || 0, 0, 9999));
      return redirect(res, `/admin?vue=stock&msg=ok`, { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/admin/prix',
    handler: async (req, res) => {
      if (!admin.isAuthed(req)) return redirect(res, '/admin', { status: 303 });
      const body = await form(req);
      store.setProductPrice(Number(body.productId), Number(body.price));
      return redirect(res, `/admin?vue=prix&msg=ok`, { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/admin/commande',
    handler: async (req, res) => {
      if (!admin.isAuthed(req)) return redirect(res, '/admin', { status: 303 });
      const body = await form(req);
      store.setOrderStatus(Number(body.orderId), String(body.status || ''));
      return redirect(res, `/admin?vue=commandes&msg=ok`, { status: 303 });
    },
  },

  {
    method: 'POST',
    pattern: '/admin/promo',
    handler: async (req, res) => {
      if (!admin.isAuthed(req)) return redirect(res, '/admin', { status: 303 });
      const body = await form(req);
      if (body.remove) store.deletePromo(body.code);
      else if (/^[A-Z0-9-]{3,20}$/.test(String(body.code || '').toUpperCase())) {
        store.upsertPromo({
          code: String(body.code).toUpperCase(),
          label: String(body.label || body.code).slice(0, 120),
          kind: ['percent', 'amount', 'freeship'].includes(body.kind) ? body.kind : 'percent',
          value: Math.round(Number(body.value) || 0),
          min: Math.round(Number(body.min || 0) * 100),
          maxUses: Math.round(Number(body.maxUses) || 0),
        });
      }
      return redirect(res, '/admin?vue=promos&msg=ok', { status: 303 });
    },
  },
];

/* ------------------------------------------------------------ validation */

function validateCheckout(body) {
  const errors = {};
  if (!String(body.firstName || '').trim()) errors.firstName = 'Indiquez votre prénom.';
  if (!String(body.lastName || '').trim()) errors.lastName = 'Indiquez votre nom.';
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(body.email || '').trim())) errors.email = 'Adresse e-mail invalide.';
  if (String(body.address || '').trim().length < 5) errors.address = 'Adresse trop courte.';
  if (!/^\d{4,6}$/.test(String(body.zip || '').trim())) errors.zip = 'Code postal invalide.';
  if (!String(body.city || '').trim()) errors.city = 'Indiquez votre ville.';
  if (body.terms !== '1') errors.terms = 'Merci d’accepter les conditions de vente.';
  return errors;
}

/* -------------------------------------------------------------- annexes */

function campaignNotices() {
  return [
    { kicker: 'Atelier', title: 'Réparé à vie, offert', text: 'Nous réparons gratuitement toute pièce Maison Noire, sans limite de durée.' },
    { kicker: 'Logistique', title: 'Expédié en 24 h', text: 'Commandes préparées dans notre atelier de Lyon, à la main, une par une.' },
    { kicker: 'Transparence', title: 'Stocks réels', text: 'Les quantités affichées sont celles de nos déclinaisons, décrémentées à chaque vente.' },
  ];
}

/** Raccourci : lit le bandeau éventuel de l’URL et le transmet à la vue. */
const flashOf = (req) => flash(new URL(req.url, 'http://local'));

function notFoundWithChrome(req, res, ctx) {
  const body = `
  <div class="wrap empty">
    <span class="kicker">Erreur 404</span>
    <h1>Cette page n’existe pas — ou la pièce est partie.</h1>
    <p>Les collections sont limitées : certaines références quittent le catalogue à la fin de la campagne.</p>
    <a class="btn btn--ink" href="/boutique">Retour à la boutique</a>
  </div>`;
  return html(res, 404, layout({ title: 'Page introuvable', body, cartCount: ctx ? ctx.totals.qty : 0 }));
}

/* -------------------------------------------------------------- contenus */

const HOME_REVIEWS = [
  { author: 'Claire V.', city: 'Nantes', rating: 5, title: 'Le coffret du soir', body: 'J’ai commandé trois pièces pour bénéficier du palier : tout est arrivé en trois jours, emballé comme chez un joaillier.' },
  { author: 'Hugo P.', city: 'Lille', rating: 5, title: 'La qualité se voit au détail', body: 'Le plaid est lourd, chaud, et les finitions sont faites main. On sent la différence avec ce que j’achetais avant.' },
  { author: 'Amina T.', city: 'Marseille', rating: 4, title: 'Beau et utile', body: 'La lampe nomade suit toute la maison. Un peu plus chère qu’en grande surface, mais on comprend pourquoi.' },
];

const JOURNAL = [
  {
    kicker: 'Atelier', title: 'Pourquoi nous arrêtons nos collections', reading: 4, author: 'Élise Marchand',
    excerpt: 'Une pièce reconduite à l’identique perd la moitié de sa valeur. Nous préférons arrêter et recommencer.',
    body: 'Nous produisons par série numérotée : entre 80 et 400 exemplaires selon les matières. Une fois la série écoulée, nous ne la relançons pas. Cela nous force à améliorer chaque modèle plutôt qu’à le répéter, et cela protège la valeur de ce que vous possédez déjà.',
  },
  {
    kicker: 'Matières', title: 'Laine des Pyrénées : la traçabilité, vraiment', reading: 6, author: 'Paul Berthier',
    excerpt: 'Nous connaissons les onze élevages qui fournissent la filature de Lavelanet. Voici comment nous le vérifions.',
    body: 'Chaque ballot de laine porte un numéro de lot qui remonte à l’exploitation. Nous auditons la filature deux fois par an et publions les certificats dans nos fiches produit. C’est plus cher de 18 % qu’une laine importée non tracée — nous avons choisi de l’assumer.',
  },
  {
    kicker: 'Coulisses', title: 'Les 48 heures les plus denses de l’année', reading: 5, author: 'Élise Marchand',
    excerpt: 'Le Black Friday représente 22 % de notre chiffre annuel. Voici comment l’atelier s’y prépare.',
    body: 'Nous arrêtons les commandes professionnelles trois semaines avant, nous formons deux préparateurs supplémentaires et nous fabriquons deux fois plus d’emballages cadeau. Résultat : 92 % des commandes partent dans les 24 heures, y compris le samedi.',
  },
  {
    kicker: 'Réparation', title: 'Ce que 11 400 réparations nous ont appris', reading: 7, author: 'Karim Haddad',
    excerpt: 'Les pièces les plus solides ne sont pas les plus chères : ce sont les plus simples à réparer.',
    body: 'Sur cinq ans, nos statistiques montrent que les objets fabriqués en pièces détachées interchangeables survivent deux fois plus longtemps. C’est pourquoi nous avons retiré trois modèles de notre catalogue et remplacé leurs assemblages collés par des vis en laiton.',
  },
];

export { JOURNAL };
