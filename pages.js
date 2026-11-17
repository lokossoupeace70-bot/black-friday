/**
 * views/pages.js — pages complètes rendues côté serveur.
 * Chaque fonction est pure : elle reçoit des données et renvoie du HTML.
 */
import { h, euros } from '../http.js';
import { TIERS, EVENT, deliveryWindow, fmtEuro } from '../pricing.js';
import { layout, sectionHead, stars, productCard, priceBlock, tierMeter, breadcrumb, featureRow } from './ui.js';

const reviewCard = (review) => `
  <figure class="quote">
    <blockquote>« ${h(review.body)} »</blockquote>
    <figcaption>
      <b>${h(review.title)}</b>
      <span>${h(review.author)}${review.city ? ` · ${h(review.city)}` : ''}</span>
      ${stars(review.rating)}
      <em>Achat vérifié</em>
    </figcaption>
  </figure>`;

/* ================================================================== ACCUEIL == */

export function home({ collections, featured, notices, wishlist, totals, journal, reviews, flash = {} }) {
  const hero = featured[0];
  const window_ = deliveryWindow();

  const body = `
  <section class="hero">
    <div class="wrap hero__grid">
      <div class="hero__copy">
        <span class="kicker">Black Friday 2026 · du 27 au 30 novembre</span>
        <h1>Entrer dans la&nbsp;Maison,<br><em>à moitié prix.</em></h1>
        <p class="hero__lead">Douze ans de savoir-faire, six collections, une seule fenêtre de quatre jours. Chaque pièce est numérotée, garantie à vie et expédiée depuis notre atelier.</p>

        <ul class="hero__proof">
          ${featureRow('❦', 'Fabriqué en France', ' — ateliers de Lyon et de Lavelanet.')}
          ${featureRow('↺', 'Réparable à vie', ' — service atelier gratuit, à vie.')}
          ${featureRow('✦', 'Remises par palier', ' — la remise grimpe à chaque pièce ajoutée.')}
        </ul>

        <div class="hero__cta">
          <a class="btn btn--ink btn--lg" href="/boutique">Découvrir la sélection</a>
          <a class="btn btn--line btn--lg" href="#paliers">Comprendre les paliers</a>
        </div>

        <p class="hero__note">${stars(4.8, { showValue: true })} · 4 812 avis vérifiés · 96 % de clients qui recommandent la Maison.</p>
      </div>

      ${hero ? `
      <a class="hero__piece" href="/produit/${h(hero.slug)}">
        <img src="/studio/${h(hero.slug)}.svg" alt="${h(hero.name)}" width="520" height="620">
        <span class="hero__badge">−${hero.discount} %</span>
        <span class="hero__caption">
          <span class="kicker">${h(hero.collection_name)}</span>
          <b>${h(hero.name)}</b>
          <span class="hero__price">${euros(hero.price_cents)} <s>${euros(hero.compare_cents)}</s></span>
        </span>
      </a>` : ''}
    </div>
  </section>

  <section class="band band--dark" id="paliers">
    <div class="wrap">
      <span class="kicker kicker--light">La mécanique de la campagne</span>
      <h2 class="band__title">Plus vous composez, plus la remise monte.</h2>
      <p class="band__lead">Aucun code à chercher : la remise s’applique automatiquement dès la deuxième pièce. C’est notre façon de vous laisser goûter à la Maison.</p>
      <div class="tiers">
        ${TIERS.filter((t) => t.percent > 0).map((tier, i) => `
          <div class="tier">
            <span class="tier__rank">Palier ${i + 1}</span>
            <b class="tier__percent">−${tier.percent} %</b>
            <span class="tier__from">dès ${tier.minQty} pièces</span>
            <p class="tier__desc">${tierLabelText(tier)}</p>
          </div>`).join('')}
        <div class="tier tier--codes">
          <span class="tier__rank">Et en plus</span>
          <b class="tier__percent">−20 %</b>
          <span class="tier__from">avec le code MAISON20</span>
          <p class="tier__desc">Cumulable avec votre palier, dès 150 € d’achat.</p>
        </div>
      </div>
      <p class="band__foot">${tierMeter(totals)}</p>
    </div>
  </section>

  ${notices.length ? `
  <section class="section section--tight">
    <div class="wrap notices">
      ${notices.map((n) => `<div class="notice-card">
        <span class="notice-card__kicker">${h(n.kicker)}</span>
        <b>${h(n.title)}</b>
        <p>${h(n.text)}</p>
      </div>`).join('')}
    </div>
  </section>` : ''}

  <section class="section">
    <div class="wrap">
      ${sectionHead('Six univers', 'Nos collections', 'Chaque univers est confié à un artisan référent, qui signe la pièce et garantit sa réparation.', `<a class="link-arrow" href="/boutique">Voir toute la boutique →</a>`)}
      <div class="collections">
        ${collections.map((c) => `
          <a class="collection" href="/collection/${h(c.slug)}">
            ${c.image ? `<img src="/studio/${h(c.image)}.svg" alt="${h(c.name)}" width="520" height="620" loading="lazy">` : ''}
            <span class="collection__body">
              <span class="kicker">${h(c.kicker)}</span>
              <b class="collection__name">${h(c.name)}</b>
              <span class="collection__count">${c.product_count} pièce${c.product_count > 1 ? 's' : ''}</span>
            </span>
          </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section section--paper">
    <div class="wrap">
      ${sectionHead('Sélection de la campagne', 'Les pièces les plus convoitées', 'Les séries sont limitées : la pastille indique le stock réel, mis à jour à chaque commande.', `<a class="link-arrow" href="/boutique?tri=remise">Trier par remise →</a>`)}
      <div class="grid-pieces">
        ${featured.slice(0, 8).map((p) => productCard(p, { wishlist })).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap editorial">
      <div class="editorial__media">
        ${featured[1] ? `<img src="/studio/${h(featured[1].slug)}.svg?v=cadeau" alt="Coffret cadeau Maison Noire" width="520" height="620" loading="lazy">` : ''}
      </div>
      <div class="editorial__copy">
        <span class="kicker">Le geste juste</span>
        <h2>Un coffret, sans se tromper.</h2>
        <p>Trois pièces réunies, un écrin en bois de cèdre, une carte manuscrite. C’est la formule que nos clients choisissent pour offrir — et celle qui déclenche la remise maximale de −30 %.</p>
        <ul class="checklist">
          <li>Tiercé au fil de votre commande</li>
          <li>Emballage cadeau offert dès trois pièces</li>
          <li>Échange d’une pièce du coffret sous 30 jours</li>
        </ul>
        <div class="editorial__cta">
          <a class="btn btn--ink" href="/boutique?tri=remise">Composer mon coffret</a>
          <span class="muted">${h(window_.label)}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="section section--paper">
    <div class="wrap">
      ${sectionHead('Le Journal', 'Ce que nous apprenons en fabriquant', '', `<a class="link-arrow" href="/journal">Lire le Journal →</a>`)}
      <div class="journal-grid">
        ${journal.map((article) => `
          <article class="article">
            <span class="kicker">${h(article.kicker)}</span>
            <h3>${h(article.title)}</h3>
            <p>${h(article.excerpt)}</p>
            <span class="article__meta">${h(article.reading)} min de lecture</span>
          </article>`).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      ${sectionHead('Avis vérifiés', 'Ils nous ont fait confiance cette semaine', '', '')}
      <div class="quotes">
        ${reviews.map(reviewCard).join('')}
      </div>
    </div>
  </section>

  <section class="band band--ink">
    <div class="wrap band__cta">
      <div>
        <span class="kicker kicker--light">Il reste ${countdownLabel()}</span>
        <h2 class="band__title">Les séries ne seront pas reconduites.</h2>
        <p class="band__lead">Chaque collection est produite en quantité fixée. Une fois épuisée, la pièce n’est réapprovisionnée qu’à l’automne suivant.</p>
      </div>
      <a class="btn btn--gold btn--lg" href="/boutique">Choisir mes pièces</a>
    </div>
  </section>`;

  return layout({ title: 'Black Friday — entrer dans la Maison', body, active: '/', cartCount: totals.qty, message: flash.message, tone: flash.tone });
}

const tierLabelText = (tier) => {
  if (tier.minQty === 2) return 'Une pièce pour soi, une pour offrir : le duo déclenche la remise.';
  if (tier.minQty === 3) return 'Le seuil que choisissent 6 clients sur 10 — livraison offerte incluse.';
  return 'Le coffret complet : la remise maximale de la campagne, sur cinq pièces ou plus.';
};

function countdownLabel() {
  const left = Math.max(0, EVENT.endsAt.getTime() - Date.now());
  const days = Math.floor(left / 864e5);
  if (days >= 1) return `${days} jour${days > 1 ? 's' : ''}`;
  return `${Math.floor(left / 36e5)} heures`;
}

/* ================================================================ BOUTIQUE == */

export function boutique({ products, collections, current, query, sort, wishlist, totals, title, lead, flash = {} }) {
  const sorts = [
    ['selection', 'Notre sélection'],
    ['remise', 'Remise la plus forte'],
    ['prix', 'Prix croissant'],
    ['prix-desc', 'Prix décroissant'],
    ['note', 'Les mieux notées'],
    ['nouveaute', 'Nouveautés'],
  ];

  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, current ? current.name : 'La boutique']])}
    <header class="page-head">
      <span class="kicker">${current ? h(current.kicker) : 'Toute la Maison'}</span>
      <h1>${h(title)}</h1>
      <p>${h(lead)}</p>
    </header>

    <div class="filters">
      <div class="filters__row">
        <a class="pill ${!current ? 'is-active' : ''}" href="/boutique">Tout</a>
        ${collections.map((c) => `<a class="pill ${current && current.slug === c.slug ? 'is-active' : ''}" href="/collection/${h(c.slug)}">${h(c.name)}<em>${c.product_count}</em></a>`).join('')}
      </div>
      <form class="filters__sort" method="get" action="${current ? `/collection/${h(current.slug)}` : '/boutique'}">
        <input type="hidden" name="q" value="${h(query)}">
        <label for="tri">Trier</label>
        <select id="tri" name="tri" onchange="this.form.submit()">
          ${sorts.map(([value, label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <noscript><button class="btn btn--line" type="submit">Appliquer</button></noscript>
      </form>
    </div>

    ${query ? `<p class="result-line">${products.length} résultat${products.length > 1 ? 's' : ''} pour « <b>${h(query)}</b> » — <a href="${current ? `/collection/${h(current.slug)}` : '/boutique'}">effacer</a></p>` : ''}

    ${products.length
      ? `<div class="grid-pieces">${products.map((p) => productCard(p, { wishlist })).join('')}</div>`
      : `<div class="empty">
           <h2>Aucune pièce ne correspond</h2>
           <p>Essayez un autre mot, ou parcourez nos six collections.</p>
           <a class="btn btn--ink" href="/boutique">Voir toute la boutique</a>
         </div>`}
  </div>`;

  return layout({
    title: title,
    description: lead,
    body,
    active: current ? `/collection/${current.slug}` : '/boutique',
    cartCount: totals.qty,
    message: flash.message,
    tone: flash.tone,
  });
}

/* ================================================================= PRODUIT == */

export function produit({ product, wishlist, totals, message, tone }) {
  const wished = wishlist.includes(product.id);
  const window_ = deliveryWindow();
  const first = product.skus.find((s) => s.stock > 0) || product.skus[0];

  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [`/collection/${h(product.collection_slug)}`, product.collection_name], [null, product.name]])}

    <div class="pdp">
      <div class="pdp__gallery">
        <figure class="pdp__main">
          <img id="pdp-image" src="/studio/${h(product.slug)}.svg?v=${encodeURIComponent(first.option_value)}"
               alt="${h(product.name)}" width="520" height="620">
          <span class="pdp__tag">−${product.discount} %</span>
        </figure>
        <div class="pdp__thumbs">
          ${product.skus.map((sku, i) => `
            <button type="button" class="${i === 0 ? 'is-active' : ''}" data-variant-thumb
                    data-value="${h(sku.option_value)}" data-stock="${sku.stock}"
                    aria-label="Voir ${h(sku.option_value)}">
              <img src="/studio/${h(product.slug)}.svg?v=${encodeURIComponent(sku.option_value)}" alt="" width="90" height="108" loading="lazy">
              <span>${h(sku.option_value)}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="pdp__info">
        <span class="kicker">${h(product.collection_name)} · ${h(product.notes)}</span>
        <h1>${h(product.name)}</h1>
        <div class="pdp__meta">
          ${stars(product.rating, { showValue: true })}
          <span>${product.review_count} avis vérifiés</span>
          ${product.edition ? `<span class="badge-line">${h(product.edition)}</span>` : ''}
        </div>

        <p class="pdp__story">${h(product.story)}</p>

        <div class="pdp__price">
          ${priceBlock(product, { large: true })}
          <p class="pdp__vat">Prix TTC, TVA 20 % incluse · payez en 4× ${euros(Math.round(product.price_cents / 4))} sans frais</p>
          <p class="pdp__tier">Ajoutez 1 pièce au panier : votre remise passe à <b>−15 %</b>, soit ${euros(Math.round(product.price_cents * 0.15))} économisés sur cette seule pièce.</p>
        </div>

        <form class="pdp__buy" method="post" action="/panier/ajouter">
          <input type="hidden" name="productId" value="${product.id}">
          <fieldset class="options">
            <legend>${h(first.option_name)}<span id="stock-hint">${first.stock} en stock</span></legend>
            <div class="options__list">
              ${product.skus.map((sku, i) => {
                const disabled = sku.stock <= 0;
                return `<label class="option ${disabled ? 'is-out' : ''}">
                  <input type="radio" name="skuId" value="${sku.id}" ${i === 0 ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                  <span class="option__body">
                    <b>${h(sku.option_value)}</b>
                    <span>${euros(sku.price_cents)}</span>
                    <em>${disabled ? 'Épuisé' : `${sku.stock} en stock`}</em>
                  </span>
                </label>`;
              }).join('')}
            </div>
          </fieldset>

          <div class="pdp__qty">
            <label for="qty">Quantité</label>
            <div class="stepper" data-stepper>
              <button type="button" data-step="-1" aria-label="Diminuer">−</button>
              <input id="qty" name="qty" type="number" value="1" min="1" max="10" inputmode="numeric">
              <button type="button" data-step="1" aria-label="Augmenter">+</button>
            </div>
          </div>

          <div class="pdp__actions">
            <button class="btn btn--ink btn--lg" type="submit">Ajouter à ma sélection</button>
            <button class="btn btn--line btn--lg" type="submit" name="express" value="1">Commander maintenant</button>
          </div>
          <p class="pdp__reassure">${h(window_.label)} · Retour gratuit sous 30 jours · Garantie à vie en atelier</p>
        </form>

        <button class="wish-inline ${wished ? 'is-on' : ''}" type="button" data-wish data-product="${product.id}">
          ${wished ? '♥ Dans vos favoris' : '♡ Ajouter aux favoris'}
        </button>

        <ul class="features">
          ${featureRow('✦', 'Matières', ` : ${product.materials.join(' · ')}`)}
          ${featureRow('✎', 'Entretien', ` : ${product.care}`)}
          ${featureRow('↺', 'Réparation', ' : gratuite à vie, dans notre atelier de Lyon.')}
        </ul>
      </div>
    </div>

    <section class="section">
      <div class="grid-two">
        <div>
          <span class="kicker">Détails du modèle</span>
          <h3>Fiche technique</h3>
          <table class="spec">
            <tbody>
              <tr><td>Collection</td><td>${h(product.collection_name)}</td></tr>
              <tr><td>Notes</td><td>${h(product.notes)}</td></tr>
              ${product.skus.map((sku) => `<tr><td>${h(sku.option_name)} · ${h(sku.option_value)}</td><td>${euros(sku.price_cents)} — ${sku.stock} en stock</td></tr>`).join('')}
              <tr><td>Matières</td><td>${h(product.materials.join(', '))}</td></tr>
              <tr><td>Entretien</td><td>${h(product.care)}</td></tr>
              <tr><td>Livraison</td><td>Offerte dès 90 € · ${h(window_.label)}</td></tr>
              <tr><td>Garantie</td><td>À vie, pièces et main-d’œuvre</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <span class="kicker">Avis clients</span>
          <h3>${product.review_count} avis vérifiés</h3>
          <div class="rating-summary">
            <div class="rating-summary__score">
              <b>${String(product.rating).replace('.', ',')}</b>
              ${stars(product.rating)}
              <span>${product.review_count} avis</span>
            </div>
            <div class="rating-summary__bars">
              ${product.ratingBreakdown.map((row) => `
                <div><span>${row.stars} ★</span><span class="bar"><i style="width:${row.percent}%"></i></span><span>${Math.round(row.percent)} %</span></div>`).join('')}
            </div>
          </div>
          <div class="quotes quotes--stack">
            ${product.reviews.slice(0, 3).map(reviewCard).join('')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--paper">
      <div class="wrap">
        ${sectionHead('Dans le même esprit', `Autres pièces — ${product.collection_name}`, '')}
        <div class="grid-pieces grid-pieces--3">
          ${product.related.map((p) => productCard(p, { wishlist })).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${sectionHead('Nos clients ont aussi choisi', 'Compléter la pièce', 'Trois associations validées par notre atelier.')}
        <div class="grid-pieces grid-pieces--3">
          ${product.crossSell.map((p) => productCard(p, { wishlist })).join('')}
        </div>
      </div>
    </section>
  </div>`;

  return layout({
    title: product.name,
    description: product.story,
    body,
    active: `/collection/${product.collection_slug}`,
    cartCount: totals.qty,
    message,
    tone,
  });
}

/* ================================================================== PANIER == */

export function panier({ lines, totals, message, tone, promo, code = '' }) {
  const window_ = deliveryWindow();

  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, 'Mon panier']])}
    <header class="page-head">
      <span class="kicker">Étape 1 sur 3</span>
      <h1>Ma sélection</h1>
      <p>Les remises par palier se calculent automatiquement. Aucun code n’est nécessaire pour en bénéficier.</p>
    </header>

    ${lines.length ? `
    <div class="cart">
      <div class="cart__lines">
        ${tierMeter(totals)}
        ${lines.map((line) => `
          <article class="cart-line">
            <a class="cart-line__media" href="/produit/${h(line.slug)}">
              <img src="${h(line.image)}" alt="${h(line.name)}" width="150" height="180" loading="lazy">
            </a>
            <div class="cart-line__body">
              <span class="kicker">${h(line.collectionName)}</span>
              <h3><a href="/produit/${h(line.slug)}">${h(line.name)}</a></h3>
              <p class="cart-line__option">${h(line.optionName)} · ${h(line.option)} ${line.stock <= 12 ? `<em>— ${line.stock} en stock</em>` : ''}</p>
              <form class="cart-line__qty" method="post" action="/panier/modifier">
                <input type="hidden" name="lineId" value="${line.lineId}">
                <div class="stepper stepper--sm" data-stepper data-autosubmit>
                  <button type="button" data-step="-1" aria-label="Diminuer">−</button>
                  <input name="qty" type="number" value="${line.qty}" min="1" max="10" inputmode="numeric">
                  <button type="button" data-step="1" aria-label="Augmenter">+</button>
                </div>
                <button class="link" type="submit">Mettre à jour</button>
              </form>
            </div>
            <div class="cart-line__price">
              <b>${euros(line.lineTotal)}</b>
              ${line.compareTotal > line.lineTotal ? `<s>${euros(line.compareTotal)}</s>` : ''}
              <form method="post" action="/panier/supprimer">
                <input type="hidden" name="lineId" value="${line.lineId}">
                <button class="link link--danger" type="submit">Retirer</button>
              </form>
            </div>
          </article>`).join('')}
      </div>

      <aside class="summary">
        <h2>Récapitulatif</h2>
        <dl class="summary__list">
          <div><dt>Sous-total (${totals.qty} pièce${totals.qty > 1 ? 's' : ''})</dt><dd>${euros(totals.subtotal)}</dd></div>
          ${totals.bundleDiscount ? `<div class="is-saving"><dt>Remise ${h(totals.tier.label)} (−${totals.tier.percent} %)</dt><dd>−${euros(totals.bundleDiscount)}</dd></div>` : ''}
          ${totals.promoDiscount ? `<div class="is-saving"><dt>Code ${h(promo ? promo.code : '')}</dt><dd>−${euros(totals.promoDiscount)}</dd></div>` : ''}
          <div><dt>Livraison</dt><dd>${totals.shipping ? euros(totals.shipping) : 'Offerte'}</dd></div>
          <div><dt>dont TVA (20 %)</dt><dd>${euros(totals.tax)}</dd></div>
          <div class="summary__total"><dt>Total TTC</dt><dd>${euros(totals.total)}</dd></div>
        </dl>

        ${totals.nextTier ? `
        <p class="summary__nudge">
          Ajoutez <b>${totals.nextTier.minQty - totals.qty} pièce${totals.nextTier.minQty - totals.qty > 1 ? 's' : ''}</b> pour passer à
          <b>−${totals.nextTier.percent} %</b> et économiser <b>${euros(totals.potentialSaving)}</b> de plus.
        </p>` : `<p class="summary__nudge">Vous êtes au palier maximal — remise de <b>${totals.tier.percent} %</b> appliquée.</p>`}

        ${!totals.shipping ? '' : `<p class="summary__nudge summary__nudge--soft">Encore ${euros(totals.shippingRemaining)} et la livraison vous est offerte.</p>`}

        <form class="promo" method="post" action="/panier/promo">
          ${promo ? `
            <div class="promo__applied">
              <span><b>${h(promo.code)}</b> appliqué</span>
              <button class="link" type="submit" name="remove" value="1">Retirer</button>
            </div>` : `
            <label for="code">Code de la Maison</label>
            <div class="promo__row">
              <input id="code" name="code" placeholder="MAISON20">
              <button class="btn btn--line" type="submit">Appliquer</button>
            </div>
            <p class="promo__hint">Essayez <b>MAISON20</b> : −20 % supplémentaires dès 150 €.</p>`}
        </form>

        <a class="btn btn--ink btn--block btn--lg" href="/commande${code ? `?code=${encodeURIComponent(code)}` : ''}">Passer à la livraison</a>
        <p class="summary__reassure">Paiement sécurisé · Retour gratuit 30 jours · ${h(window_.label)}</p>
        <div class="gift-note">
          <b>Offrir cette sélection ?</b>
          <span>Cochez l’emballage cadeau à l’étape suivante (offert dès 3 pièces).</span>
        </div>
      </aside>
    </div>` : `
    <div class="empty">
      <h2>Votre sélection est vide</h2>
      <p>Les collections sont ouvertes jusqu’au 30 novembre. Commencez par nos pièces signature.</p>
      <a class="btn btn--ink" href="/boutique">Parcourir la boutique</a>
    </div>`}
  </div>`;

  return layout({ title: 'Mon panier', body, active: '/panier', cartCount: totals.qty, message, tone });
}

/* ================================================================ COMMANDE == */

export function commande({ lines, totals, values, errors, promo, giftWrap }) {
  const window_ = deliveryWindow();
  const field = (name, label, opts = {}) => {
    const { type = 'text', className = '', autocomplete = '', placeholder = '', inputmode = '' } = opts;
    return `<div class="field ${errors[name] ? 'is-invalid' : ''} ${className}">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${h(values[name] || '')}"
             ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${placeholder ? `placeholder="${h(placeholder)}"` : ''}
             ${inputmode ? `inputmode="${inputmode}"` : ''}>
      <span class="field__error">${errors[name] ? h(errors[name]) : ''}</span>
    </div>`;
  };

  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], ['/panier', 'Mon panier'], [null, 'Livraison']])}
    <header class="page-head">
      <span class="kicker">Étape 2 sur 3</span>
      <h1>Livraison &amp; règlement</h1>
      <p>Vous n’avez pas besoin de créer un compte : le suivi de commande se fait avec votre référence et votre adresse e-mail.</p>
    </header>

    <form class="checkout" method="post" action="/commande" novalidate>
      <input type="hidden" name="promoCode" value="${promo ? h(promo.code) : ''}">
      <div class="checkout__form">
        <section class="panel">
          <h2><span>1</span> Vos coordonnées</h2>
          <div class="grid-form">
            ${field('firstName', 'Prénom', { autocomplete: 'given-name' })}
            ${field('lastName', 'Nom', { autocomplete: 'family-name' })}
            ${field('email', 'Adresse e-mail', { type: 'email', autocomplete: 'email' })}
            ${field('phone', 'Téléphone', { type: 'tel', autocomplete: 'tel', placeholder: 'Pour la livraison' })}
          </div>
        </section>

        <section class="panel">
          <h2><span>2</span> Adresse de livraison</h2>
          <div class="grid-form">
            ${field('address', 'Adresse', { autocomplete: 'street-address', className: 'span-2' })}
            ${field('zip', 'Code postal', { autocomplete: 'postal-code', inputmode: 'numeric' })}
            ${field('city', 'Ville', { autocomplete: 'address-level2' })}
          </div>
        </section>

        <section class="panel">
          <h2><span>3</span> Emballage cadeau</h2>
          <label class="gift">
            <input type="checkbox" name="giftWrap" value="1" ${giftWrap ? 'checked' : ''} ${totals.qty >= 3 ? 'data-free-gift' : ''}>
            <span>
              <b>Emballage cadeau Maison Noire</b>
              <em>${totals.qty >= 3 ? 'Offert — vous avez au moins trois pièces' : `${euros(490)} · offert dès 3 pièces`}</em>
              <small>Coffret bois de cèdre, papier de soie, ruban coton et carte manuscrite.</small>
            </span>
          </label>
          <div class="field">
            <label for="giftMessage">Message à recopier sur la carte</label>
            <textarea id="giftMessage" name="giftMessage" rows="3" maxlength="240" placeholder="Pour Claire, avec toute mon affection…">${h(values.giftMessage || '')}</textarea>
          </div>
        </section>

        <section class="panel">
          <h2><span>4</span> Règlement</h2>
          <div class="pay-list">
            ${[
              ['carte', 'Carte bancaire', 'Visa, Mastercard, CB — 3D Secure activé'],
              ['paypal', 'PayPal', 'Paiement en 4× sans frais'],
              ['4x', '4× sans frais', `4 mensualités de ${euros(Math.round(totals.total / 4))}`],
            ].map(([value, title, text], i) => `
              <label class="pay">
                <input type="radio" name="paymentMethod" value="${value}" ${i === 0 ? 'checked' : ''}>
                <span><b>${title}</b><em>${text}</em></span>
              </label>`).join('')}
          </div>
          <div class="grid-form grid-form--pay">
            <div class="field span-2">
              <label for="card">Numéro de carte</label>
              <input id="card" inputmode="numeric" placeholder="4242 4242 4242 4242" autocomplete="cc-number">
            </div>
            <div class="field"><label for="exp">Expiration</label><input id="exp" placeholder="12/29"></div>
            <div class="field"><label for="cvc">Cryptogramme</label><input id="cvc" placeholder="123" inputmode="numeric"></div>
          </div>
          <p class="muted small">Démonstration : aucun paiement réel n’est exécuté, aucune donnée bancaire n’est transmise ni conservée.</p>
        </section>

        <label class="terms">
          <input type="checkbox" name="terms" value="1" ${values.terms ? 'checked' : ''}>
          <span>J’accepte les conditions de vente et la politique de retour sous 30 jours.${errors.terms ? `<em> ${h(errors.terms)}</em>` : ''}</span>
        </label>
      </div>

      <aside class="summary summary--sticky">
        <h2>Votre commande</h2>
        <ul class="summary__lines">
          ${lines.map((line) => `
            <li>
              <img src="${h(line.image)}" alt="" width="60" height="72" loading="lazy">
              <span><b>${h(line.name)}</b><em>${h(line.option)} × ${line.qty}</em></span>
              <b>${euros(line.lineTotal)}</b>
            </li>`).join('')}
        </ul>
        <dl class="summary__list">
          <div><dt>Sous-total</dt><dd>${euros(totals.subtotal)}</dd></div>
          ${totals.bundleDiscount ? `<div class="is-saving"><dt>Remise ${h(totals.tier.label)}</dt><dd>−${euros(totals.bundleDiscount)}</dd></div>` : ''}
          ${totals.promoDiscount ? `<div class="is-saving"><dt>Code ${h(promo ? promo.code : '')}</dt><dd>−${euros(totals.promoDiscount)}</dd></div>` : ''}
          ${totals.giftWrap ? `<div><dt>Emballage cadeau</dt><dd>${euros(totals.giftWrap)}</dd></div>` : ''}
          <div><dt>Livraison</dt><dd>${totals.shipping ? euros(totals.shipping) : 'Offerte'}</dd></div>
          <div><dt>dont TVA</dt><dd>${euros(totals.tax)}</dd></div>
          <div class="summary__total"><dt>Total</dt><dd>${euros(totals.total)}</dd></div>
        </dl>
        <button class="btn btn--ink btn--block btn--lg" type="submit">Régler ${euros(totals.total)}</button>
        <p class="summary__reassure">${h(window_.label)}</p>
        <ul class="summary__trust">
          <li>Paiement chiffré, aucune donnée conservée</li>
          <li>Retour gratuit sous 30 jours</li>
          <li>Garantie atelier à vie</li>
        </ul>
      </aside>
    </form>
  </div>`;

  return layout({ title: 'Livraison & règlement', body, active: '/commande', cartCount: totals.qty, message: errors.__global, tone: 'ko' });
}

/* ============================================================ CONFIRMATION == */

export function confirmation({ order, window_ }) {
  const steps = ['Commande reçue', 'En atelier', 'Expédiée', 'Livrée'];
  const current = order.status === 'annulée' ? -1 : Math.min(3, ['en atelier', 'expédiée', 'livrée'].indexOf(order.status) + 1);

  const body = `
  <div class="wrap confirm">
    <span class="confirm__seal">✦</span>
    <span class="kicker">Étape 3 sur 3</span>
    <h1>Merci ${h(order.first_name)} — votre commande est enregistrée.</h1>
    <p class="lead">Un e-mail de confirmation part à l’instant vers <b>${h(order.email)}</b>. Chaque pièce est contrôlée à la main avant emballage.</p>
    <p class="confirm__ref">Référence <b>${h(order.ref)}</b></p>

    <ol class="timeline">
      ${steps.map((label, i) => `<li class="${i <= current ? 'is-done' : ''}"><i>${i <= current ? '✓' : i + 1}</i><span>${label}</span></li>`).join('')}
    </ol>

    <section class="panel">
      <div class="panel__head">
        <div>
          <b>Livraison estimée</b>
          <span>${h(window_.label)} · ${h(order.address)}, ${h(order.zip)} ${h(order.city)}</span>
        </div>
        <span class="status-chip status-chip--${order.status === 'annulée' ? 'ko' : 'ok'}">${h(order.status)}</span>
      </div>
      <ul class="order-lines">
        ${order.lines.map((line) => `
          <li>
            <img src="/studio/${h(line.product_slug)}.svg?v=${encodeURIComponent(line.option)}" alt="" width="60" height="72" loading="lazy">
            <span><b>${h(line.name)}</b><em>${h(line.option)} · quantité ${line.qty}</em></span>
            <b>${euros(line.unit_cents * line.qty)}</b>
          </li>`).join('')}
      </ul>
      <dl class="summary__list">
        <div><dt>Sous-total</dt><dd>${euros(order.subtotal_cents)}</dd></div>
        ${order.bundle_discount_cents ? `<div class="is-saving"><dt>Remise ${h(order.tier_label)}</dt><dd>−${euros(order.bundle_discount_cents)}</dd></div>` : ''}
        ${order.promo_discount_cents ? `<div class="is-saving"><dt>Code ${h(order.promo_code)}</dt><dd>−${euros(order.promo_discount_cents)}</dd></div>` : ''}
        ${order.gift_wrap ? `<div><dt>Emballage cadeau</dt><dd>${euros(490)}</dd></div>` : ''}
        <div><dt>Livraison</dt><dd>${order.shipping_cents ? euros(order.shipping_cents) : 'Offerte'}</dd></div>
        <div><dt>dont TVA (20 %)</dt><dd>${euros(order.tax_cents)}</dd></div>
        <div class="summary__total"><dt>Total réglé</dt><dd>${euros(order.total_cents)}</dd></div>
      </dl>
      ${order.gift_message ? `<p class="gift-message"><b>Message de la carte :</b> « ${h(order.gift_message)} »</p>` : ''}
    </section>

    <div class="confirm__actions">
      <a class="btn btn--ink" href="/suivi">Suivre ma commande</a>
      <a class="btn btn--line" href="/boutique">Poursuivre la visite</a>
    </div>
    <p class="muted small">Besoin d’une facture au nom d’une société, ou d’un échange ? Répondez simplement à l’e-mail de confirmation.</p>
  </div>`;

  return layout({ title: 'Commande confirmée', body, active: '/commande', cartCount: 0 });
}

/* ================================================================ SUIVI ===== */

export function suivi({ order, error, ref, email, window_ }) {
  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, 'Suivre ma commande']])}
    <header class="page-head center">
      <span class="kicker">Service client</span>
      <h1>Suivre ma commande</h1>
      <p>Saisissez la référence reçue par e-mail (format MN-2026-1234) et l’adresse utilisée lors de l’achat.</p>
    </header>

    <form class="track" method="get" action="/suivi">
      <label class="sr-only" for="ref">Référence</label>
      <input id="ref" name="ref" value="${h(ref || '')}" placeholder="MN-2026-1234" required>
      <label class="sr-only" for="email">E-mail</label>
      <input id="email" name="email" type="email" value="${h(email || '')}" placeholder="prenom@exemple.fr" required>
      <button class="btn btn--ink" type="submit">Rechercher</button>
    </form>

    ${error ? `<p class="track__error">${h(error)}</p>` : ''}

    ${order ? `
      <section class="panel track__result">
        <div class="panel__head">
          <div>
            <b>Commande ${h(order.ref)}</b>
            <span>Passée le ${new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · ${order.lines.length} pièce${order.lines.length > 1 ? 's' : ''}</span>
          </div>
          <span class="status-chip status-chip--${order.status === 'annulée' ? 'ko' : 'ok'}">${h(order.status)}</span>
        </div>
        <ol class="timeline timeline--compact">
          ${['Commande reçue', 'En atelier', 'Expédiée', 'Livrée'].map((label, i) => {
            const current = order.status === 'annulée' ? -1 : Math.min(3, ['en atelier', 'expédiée', 'livrée'].indexOf(order.status) + 1);
            return `<li class="${i <= current ? 'is-done' : ''}"><i>${i <= current ? '✓' : i + 1}</i><span>${label}</span></li>`;
          }).join('')}
        </ol>
        <p class="muted">${h(window_.label)}</p>
        <ul class="order-lines">
          ${order.lines.map((line) => `
            <li>
              <img src="/studio/${h(line.product_slug)}.svg?v=${encodeURIComponent(line.option)}" alt="" width="60" height="72" loading="lazy">
              <span><b>${h(line.name)}</b><em>${h(line.option)} · quantité ${line.qty}</em></span>
              <b>${euros(line.unit_cents * line.qty)}</b>
            </li>`).join('')}
        </ul>
        <dl class="summary__list">
          <div class="summary__total"><dt>Total réglé</dt><dd>${euros(order.total_cents)}</dd></div>
        </dl>
      </section>` : ''}
  </div>`;

  return layout({ title: 'Suivre ma commande', body, active: '/suivi', cartCount: 0 });
}

/* =============================================================== FAVORIS ==== */

export function favoris({ products, wishlist, totals, flash = {} }) {
  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, 'Mes favoris']])}
    <header class="page-head">
      <span class="kicker">Votre carnet</span>
      <h1>Mes favoris</h1>
      <p>Vos pièces mises de côté. Les stocks bougent vite pendant la campagne : nous ne réservons pas les favoris.</p>
    </header>
    ${products.length
      ? `<div class="grid-pieces">${products.map((p) => productCard(p, { wishlist })).join('')}</div>`
      : `<div class="empty"><h2>Aucun favori pour l’instant</h2><p>Touchez le cœur sur une pièce pour la retrouver ici.</p><a class="btn btn--ink" href="/boutique">Parcourir la boutique</a></div>`}
  </div>`;

  return layout({ title: 'Mes favoris', body, active: '/favoris', cartCount: totals.qty, message: flash.message, tone: flash.tone });
}

/* ================================================================ ÉDITORIAL == */

export function journal({ articles, flash = {} }) {
  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, 'Le Journal']])}
    <header class="page-head">
      <span class="kicker">Le Journal</span>
      <h1>Ce que nous apprenons en fabriquant</h1>
      <p>Notes d’atelier, choix de matières, chiffres de la campagne. Ce que nous ne mettons pas dans une fiche produit.</p>
    </header>
    <div class="journal-grid journal-grid--wide">
      ${articles.map((a) => `
        <article class="article article--wide">
          <span class="kicker">${h(a.kicker)}</span>
          <h2>${h(a.title)}</h2>
          <p>${h(a.excerpt)}</p>
          <p class="muted">${h(a.body)}</p>
          <span class="article__meta">${h(a.reading)} min de lecture · ${h(a.author)}</span>
        </article>`).join('')}
    </div>
  </div>`;

  return layout({ title: 'Le Journal', body, active: '/journal', cartCount: 0, message: flash.message, tone: flash.tone });
}

export function maison({ totals, stats, flash = {} }) {
  const body = `
  <div class="wrap">
    ${breadcrumb([['/', 'Accueil'], [null, 'La Maison']])}
    <header class="page-head">
      <span class="kicker">Depuis 2014</span>
      <h1>Une maison, deux ateliers, six collections.</h1>
      <p>Nous dessinons à Lyon, nous tissons à Lavelanet, nous coulons nos bougies à Grasse. Rien n’est sous-traité hors d’Europe.</p>
    </header>

    <div class="stats">
      ${stats.map(([value, label]) => `<div class="stat"><b>${h(value)}</b><span>${h(label)}</span></div>`).join('')}
    </div>

    <section class="section">
      <div class="grid-two">
        <div>
          <span class="kicker">Notre méthode</span>
          <h2>Produire peu, réparer beaucoup.</h2>
          <p>Nous produisons chaque collection en série limitée, puis nous arrêtons. Une pièce n’est jamais reconduite à l’identique : les matières évoluent, les proportions s’affinent. C’est ce qui garantit la valeur de ce que vous achetez.</p>
          <p>Notre atelier répare gratuitement, à vie, toute pièce de notre catalogue — y compris les modèles arrêtés. Nous conservons les pièces détachées des dix dernières années.</p>
          <ul class="checklist">
            <li>Laine traçable filature par filature</li>
            <li>Cuirs tannés végétal, sans chrome</li>
            <li>Cires de colza françaises, sans paraffine</li>
            <li>Emballages 100 % carton recyclé, sans plastique</li>
          </ul>
        </div>
        <div class="panel">
          <h2>Les questions qu’on nous pose</h2>
          <details open><summary>Les remises par palier sont-elles cumulables ?</summary><p>Oui. La remise volumique s’applique automatiquement, puis un code de la Maison vient s’ajouter par-dessus, dans la limite de 40 % du panier.</p></details>
          <details><summary>Et si une pièce ne me plaît pas ?</summary><p>Vous disposez de 30 jours, retour gratuit. Sur un coffret, vous pouvez échanger une seule pièce sans renvoyer l’ensemble.</p></details>
          <details><summary>La garantie à vie, concrètement ?</summary><p>Réparation gratuite, pièces et main-d’œuvre, sans limite de durée, hors usure normale des consommables (mèches, piles).</p></details>
          <details><summary>Livrez-vous hors de France ?</summary><p>Oui, dans toute l’Union européenne. Livraison offerte dès 90 € en France métropolitaine, 150 € ailleurs.</p></details>
        </div>
      </div>
    </section>
  </div>`;

  return layout({ title: 'La Maison', body, active: '/maison', cartCount: totals.qty, message: flash.message, tone: flash.tone });
}
