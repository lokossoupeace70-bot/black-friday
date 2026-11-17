/**
 * views/ui.js — squelette de page et fragments réutilisables.
 * Aucune dépendance : ce sont de simples fonctions qui renvoient des chaînes.
 */
import { h, euros } from '../http.js';
import { EVENT, TIERS, fmtEuro } from '../pricing.js';

/* --------------------------------------------------------------- fragments */

export const stars = (rating, { showValue = false } = {}) => {
  const rounded = Math.round(rating);
  const glyphs = Array.from({ length: 5 }, (_, i) => `<span class="${i < rounded ? 'on' : ''}">★</span>`).join('');
  return `<span class="stars" aria-label="${rating} sur 5">${glyphs}${showValue ? `<em>${String(rating).replace('.', ',')}</em>` : ''}</span>`;
};

export const priceBlock = (product, { large = false } = {}) => `
  <div class="price${large ? ' price--lg' : ''}">
    <span class="price__now">${euros(product.price_cents)}</span>
    <s class="price__was">${euros(product.compare_cents)}</s>
    <span class="price__save">−${euros(product.saving)}</span>
  </div>`;

export function productCard(product, { wishlist = [], compact = false } = {}) {
  const wished = wishlist.includes(product.id);
  const scarce = product.scarcest;
  return `
  <article class="piece${compact ? ' piece--compact' : ''}" data-piece="${h(product.slug)}">
    <a class="piece__media" href="/produit/${h(product.slug)}" aria-label="${h(product.name)}">
      <img src="/studio/${h(product.slug)}.svg" alt="${h(product.name)}" width="520" height="620" loading="lazy">
      <span class="piece__tag">−${product.discount} %</span>
      ${product.edition ? `<span class="piece__edition">${h(product.edition)}</span>` : ''}
      ${!product.inStock ? '<span class="piece__sold-out">Épuisé</span>' : ''}
    </a>
    <div class="piece__body">
      <span class="piece__kicker">${h(product.collection_name)} · ${h(product.notes)}</span>
      <h3 class="piece__name"><a href="/produit/${h(product.slug)}">${h(product.name)}</a></h3>
      ${stars(product.rating, { showValue: true })}
      <span class="piece__reviews">${product.review_count} avis vérifiés</span>
      ${priceBlock(product)}
      ${scarce && scarce.stock <= 12
        ? `<p class="piece__scarce">Il ne reste que <b>${scarce.stock}</b> pièce${scarce.stock > 1 ? 's' : ''} en ${h(scarce.option_value)}.</p>`
        : `<p class="piece__scarce piece__scarce--soft">${product.sold_week} pièces vendues cette semaine</p>`}
      <div class="piece__actions">
        <a class="btn btn--ink" href="/produit/${h(product.slug)}">Choisir ma déclinaison</a>
        <form method="post" action="/favoris/basculer">
          <input type="hidden" name="productId" value="${product.id}">
          <button class="icon-btn${wished ? ' is-on' : ''}" type="submit" aria-label="Ajouter aux favoris" title="Ajouter aux favoris">${wished ? '♥' : '♡'}</button>
        </form>
      </div>
    </div>
  </article>`;
}

/** Compte à rebours : rendu serveur, remis à l’heure par le JS au premier tick. */
export function countdown(className = '') {
  const left = Math.max(0, EVENT.endsAt.getTime() - Date.now());
  const parts = {
    j: Math.floor(left / 864e5),
    h: Math.floor((left % 864e5) / 36e5),
    m: Math.floor((left % 36e5) / 6e4),
    s: Math.floor((left % 6e4) / 1000),
  };
  return `<span class="countdown ${className}" data-countdown-until="${EVENT.endsAt.toISOString()}">
    <b data-cd="j">${String(parts.j).padStart(2, '0')}</b><i>j</i>
    <b data-cd="h">${String(parts.h).padStart(2, '0')}</b><i>h</i>
    <b data-cd="m">${String(parts.m).padStart(2, '0')}</b><i>min</i>
    <b data-cd="s">${String(parts.s).padStart(2, '0')}</b><i>s</i>
  </span>`;
}

/**
 * Jauge de palier : c’est l’outil de conversion central de la campagne.
 * Elle rend visible le gain immédiat de la pièce suivante.
 */
export function tierMeter(totals) {
  const { qty, tier, nextTier, potentialSaving } = totals;
  const missing = nextTier ? nextTier.minQty - qty : 0;
  return `<div class="tier-meter" role="status">
    <div class="tier-meter__head">
      <span class="tier-meter__label">Palier actuel · <b>${h(tier.label)}</b>${tier.percent ? ` (−${tier.percent} %)` : ''}</span>
      <span class="tier-meter__next">${nextTier
        ? `Encore <b>${missing} pièce${missing > 1 ? 's' : ''}</b> → <b>−${nextTier.percent} %</b>, soit ${euros(potentialSaving)} de plus`
        : 'Palier maximal atteint'}</span>
    </div>
    <div class="tier-meter__track">
      ${TIERS.map((t) => `<span class="tier-meter__step ${qty >= t.minQty ? 'is-reached' : ''}">
        <i></i><b>−${t.percent} %</b>${h(t.label)}
      </span>`).join('')}
    </div>
  </div>`;
}

export const MESSAGES = {
  ajoute: 'Pièce ajoutée à votre sélection.',
  retire: 'Pièce retirée de votre sélection.',
  quantite: 'Quantité mise à jour.',
  favori: 'Vos favoris ont été mis à jour.',
  promo: 'Code appliqué avec succès.',
  promoechec: 'Ce code n’a pas pu être appliqué.',
  newsletter: 'Merci — votre code de bienvenue arrive par e-mail.',
  panier_vide: 'Votre sélection est vide.',
  admin_refuse: 'Mot de passe incorrect.',
  stock: 'Stock ajusté.',
};

/* ------------------------------------------------------------------ layout */

const NAV = [
  ['/boutique', 'La boutique'],
  ['/collection/parfums-bougies', 'Parfums & bougies'],
  ['/collection/textile-plaid', 'Textile'],
  ['/collection/luminaires', 'Luminaires'],
  ['/journal', 'Le Journal'],
  ['/maison', 'La Maison'],
];

export function layout({
  title,
  description = 'Maison Noire — maison de décoration et d’art de vivre. Pièces numérotées, fabriquées en France.',
  body,
  active = '',
  cartCount = 0,
  message = null,
  tone = 'ok',
}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f6f1ea">
<title>${h(title)} · Maison Noire</title>
<meta name="description" content="${h(description)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%2314110f'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-family='Georgia,serif' font-size='19' fill='%23c9a227'%3EM%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/theme.css">
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>

<div class="ribbon">
  <div class="ribbon__inner">
    <span>Black Friday · jusqu’à <b>−40 %</b> et remises par palier</span>
    <span class="ribbon__sep">·</span>
    <span>Livraison offerte dès 90 €</span>
    <span class="ribbon__sep">·</span>
    <span>Emballage cadeau offert dès 3 pièces</span>
    <span class="ribbon__count">Fin de l’événement dans ${countdown('countdown--ribbon')}</span>
  </div>
</div>

<header class="masthead">
  <div class="wrap masthead__inner">
    <button class="burger" type="button" aria-label="Ouvrir le menu" data-drawer-open>☰</button>
    <nav class="masthead__nav" aria-label="Navigation principale">
      ${NAV.slice(0, 4).map(([href, label]) => `<a href="${href}" ${active === href ? 'class="is-active"' : ''}>${label}</a>`).join('')}
    </nav>
    <a class="wordmark" href="/" aria-label="Maison Noire, accueil">
      <span class="wordmark__sub">Maison</span>
      <span class="wordmark__main">NOIRE</span>
    </a>
    <div class="masthead__tools">
      <form class="search" method="get" action="/boutique" role="search">
        <label class="sr-only" for="q">Rechercher</label>
        <input id="q" name="q" type="search" placeholder="Rechercher une pièce…" value="">
        <button type="submit" aria-label="Lancer la recherche">⌕</button>
      </form>
      <a class="tool" href="/favoris" aria-label="Mes favoris">♡ <span class="tool__label">Favoris</span></a>
      <a class="tool tool--cart" href="/panier" aria-label="Mon panier">
        Panier <span class="tool__count" data-cart-count>${cartCount}</span>
      </a>
    </div>
  </div>
</header>

<nav class="subnav" aria-label="Collections">
  ${NAV.map(([href, label]) => `<a href="${href}" ${active === href ? 'class="is-active"' : ''}>${label}</a>`).join('')}
</nav>

${message ? `<div class="notice notice--${h(tone)}" role="status"><span>${h(message)}</span><button type="button" data-dismiss aria-label="Fermer">×</button></div>` : ''}

<main id="contenu">${body}</main>

<footer class="footer">
  <div class="wrap footer__grid">
    <div class="footer__brand">
      <span class="wordmark wordmark--footer"><span class="wordmark__sub">Maison</span><span class="wordmark__main">NOIRE</span></span>
      <p>Maison de décoration et d’art de vivre. Pièces numérotées, fabriquées en petites séries en France et en Europe, réparables à vie.</p>
      <div class="footer__pay"><span>VISA</span><span>MASTERCARD</span><span>PAYPAL</span><span>4× SANS FRAIS</span></div>
    </div>
    <div class="footer__col">
      <h3>Collections</h3>
      <a href="/collection/parfums-bougies">Parfums &amp; bougies</a>
      <a href="/collection/textile-plaid">Textile &amp; plaid</a>
      <a href="/collection/luminaires">Luminaires</a>
      <a href="/collection/art-de-la-table">Art de la table</a>
    </div>
    <div class="footer__col">
      <h3>La campagne</h3>
      <a href="/boutique?tri=remise">Remises les plus fortes</a>
      <a href="/boutique?tri=note">Les mieux notées</a>
      <a href="/suivi">Suivre ma commande</a>
      <a href="/journal">Le Journal</a>
    </div>
    <div class="footer__col footer__news">
      <h3>Recevoir les ventes privées</h3>
      <p class="muted">Deux e-mails par mois, jamais plus. Un code de 10 % immédiat.</p>
      <form method="post" action="/newsletter" class="newsletter">
        <label class="sr-only" for="news-email">Votre e-mail</label>
        <input id="news-email" name="email" type="email" required placeholder="prenom@exemple.fr">
        <button class="btn btn--ink" type="submit">S’inscrire</button>
      </form>
    </div>
  </div>
  <div class="wrap footer__bottom">
    <p>© 2026 Maison Noire · Démonstration e-commerce — aucun paiement réel.</p>
    <p>Black Friday 2026 · du 27 au 30 novembre · <a href="/admin">Back-office</a></p>
  </div>
</footer>

<aside class="drawer" id="drawer" aria-hidden="true" aria-label="Menu">
  <button class="drawer__close" type="button" data-drawer-close aria-label="Fermer">×</button>
  ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
  <a href="/favoris">Mes favoris</a>
  <a href="/panier">Mon panier</a>
</aside>
<div class="scrim" id="scrim" hidden></div>

<script src="/interactions.js" defer></script>
</body>
</html>`;
}

/* ---------------------------------------------------------------- gabarits */

export const sectionHead = (kicker, title, lead = '', action = '') => `
  <header class="section-head">
    <span class="kicker">${h(kicker)}</span>
    <h2>${h(title)}</h2>
    ${lead ? `<p>${h(lead)}</p>` : ''}
    ${action}
  </header>`;

export const featureRow = (icon, title, text) => `
  <li><span class="feature__icon">${icon}</span><span><b>${h(title)}</b>${h(text)}</span></li>`;

export const breadcrumb = (items) => `
  <nav class="breadcrumb" aria-label="Fil d’Ariane">
    ${items.map(([href, label], i) => `${i ? '<span>/</span>' : ''}${href ? `<a href="${href}">${h(label)}</a>` : `<span>${h(label)}</span>`}`).join('')}
  </nav>`;

export { fmtEuro };
