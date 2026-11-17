/**
 * views/admin.js — back-office de la Maison.
 * Volontairement séparé du reste : le personnel n’a pas la navigation client.
 */
import crypto from 'node:crypto';
import { h, euros } from '../http.js';
import { ORDER_STATUSES } from '../store.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'maisonnoire2026';
const TOKEN = crypto.createHmac('sha256', ADMIN_PASSWORD).update('mn-admin-v1').digest('hex');

export const authCookie = () => `mn_admin=${TOKEN}; Path=/; Max-Age=43200; SameSite=Lax; HttpOnly`;

export function isAuthed(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('mn_admin='));
  if (!raw) return false;
  const value = decodeURIComponent(raw.slice('mn_admin='.length));
  const a = crypto.createHash('sha256').update(value).digest();
  const b = crypto.createHash('sha256').update(TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

const shell = (title, body) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${h(title)} · Maison Noire</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%2314110f'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-family='Georgia,serif' font-size='19' fill='%23c9a227'%3EM%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/theme.css">
<link rel="stylesheet" href="/admin.css">
</head>
<body class="admin-body">
${body}
</body>
</html>`;

export function login({ error = false } = {}) {
  return shell('Connexion back-office', `
  <div class="admin-login">
    <form class="admin-login__box" method="post" action="/admin/connexion">
      <span class="wordmark wordmark--center"><span class="wordmark__sub">Maison</span><span class="wordmark__main">NOIRE</span></span>
      <span class="kicker">Espace atelier</span>
      <h1>Back-office campagne</h1>
      <p class="muted">Suivi des commandes, des stocks par déclinaison et des codes de la Maison.</p>
      <div class="field ${error ? 'is-invalid' : ''}">
        <label for="password">Mot de passe atelier</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
        <span class="field__error">${error ? 'Mot de passe incorrect.' : ''}</span>
      </div>
      <button class="btn btn--ink btn--block" type="submit">Ouvrir la console</button>
      <p class="muted small">Démonstration : <code>maisonnoire2026</code> — modifiable via <code>ADMIN_PASSWORD</code>.</p>
    </form>
  </div>`);
}

const TABS = [
  ['tableau', 'Tableau de bord'],
  ['commandes', 'Commandes'],
  ['stock', 'Stocks par déclinaison'],
  ['prix', 'Prix'],
  ['promos', 'Codes de la Maison'],
  ['clients', 'Clients'],
];

export function consoleView({ tab = 'tableau', data, orders, products, promos, newsletter }) {
  return shell('Back-office', `
  <div class="admin">
    <aside class="admin__nav">
      <span class="wordmark"><span class="wordmark__sub">Maison</span><span class="wordmark__main">NOIRE</span></span>
      <nav>
        ${TABS.map(([key, label]) => `<a href="/admin?vue=${key}" class="${tab === key ? 'is-active' : ''}">${label}</a>`).join('')}
      </nav>
      <div class="admin__foot">
        <span class="admin__live">● base connectée</span>
        <a href="/" target="_blank" rel="noopener">Voir la boutique ↗</a>
      </div>
    </aside>

    <main class="admin__main">
      <header class="admin__head">
        <div>
          <h1>${h(TABS.find((t) => t[0] === tab)[1])}</h1>
          <p class="muted">Campagne Black Friday — données calculées en direct sur la base.</p>
        </div>
        <span class="kicker">Mise à jour ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </header>

      ${tab === 'tableau' ? dashboard(data) : ''}
      ${tab === 'commandes' ? ordersView(orders) : ''}
      ${tab === 'stock' ? stockView(products) : ''}
      ${tab === 'prix' ? priceView(products) : ''}
      ${tab === 'promos' ? promoView(promos, data) : ''}
      ${tab === 'clients' ? clientsView(newsletter) : ''}
    </main>
  </div>`);
}

/* ---------------------------------------------------------------- onglets */

function dashboard(d) {
  const max = Math.max(...d.timeline.map((t) => t.revenue), 1);
  const collMax = Math.max(...d.byCollection.map((c) => c.revenue), 1);
  return `
  <section class="kpis">
    <div class="kpi kpi--accent"><span>Chiffre d’affaires</span><b>${euros(d.revenue)}</b><em>${d.orders} commande(s)</em></div>
    <div class="kpi"><span>Aujourd’hui</span><b>${euros(d.today)}</b><em>depuis minuit</em></div>
    <div class="kpi"><span>Panier moyen</span><b>${euros(d.averageBasket)}</b><em>${d.items} pièce${d.items > 1 ? 's' : ''} vendue${d.items > 1 ? 's' : ''}</em></div>
    <div class="kpi"><span>Emballages cadeau</span><b>${d.giftWraps}</b><em>commandes à offrir</em></div>
    <div class="kpi"><span>Inscrits newsletter</span><b>${d.newsletterCount}</b><em>base e-mail</em></div>
  </section>

  <section class="cards">
    <div class="card card--wide">
      <h2>Chiffre d’affaires par jour</h2>
      <div class="chart">
        ${d.timeline.map((day) => `
          <div class="chart__col" title="${day.day} — ${euros(day.revenue)} (${day.orders} cmd)">
            <b>${day.revenue ? euros(day.revenue) : ''}</b>
            <i style="height:${Math.max(4, Math.round((day.revenue / max) * 100))}%"></i>
            <span>${new Date(day.day).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h2>Paliers déclenchés</h2>
      <ul class="bars">
        ${d.byTier.map((tier) => `
          <li><span>${h(tier.tier_label)}</span><b>${euros(tier.revenue)}</b><em>${tier.orders} cmd</em></li>`).join('')}
      </ul>
      <h2 style="margin-top:22px">Codes utilisés</h2>
      <ul class="bars">
        ${d.promoUse.filter((p) => p.uses > 0).map((p) => `<li><span>${h(p.code)}</span><b>${p.uses}</b><em>utilisation(s)</em></li>`).join('') || '<li class="muted">Aucun code utilisé pour l’instant.</li>'}
      </ul>
    </div>
  </section>

  <section class="cards">
    <div class="card">
      <h2>Répartition par collection</h2>
      <ul class="bars">
        ${d.byCollection.map((c) => `
          <li class="bar-line">
            <span>${h(c.name)}</span><b>${euros(c.revenue)}</b>
            <span class="bar"><i style="width:${Math.round((c.revenue / collMax) * 100)}%"></i></span>
          </li>`).join('') || '<li class="muted">Aucune vente enregistrée.</li>'}
      </ul>
    </div>
    <div class="card">
      <h2>Meilleures ventes</h2>
      <table class="table">
        <thead><tr><th>Pièce</th><th>Qté</th><th>CA</th></tr></thead>
        <tbody>
          ${d.bestsellers.map((b) => `<tr>
            <td><img src="/studio/${h(b.product_slug)}.svg" alt="" width="34" height="40"> ${h(b.name)}</td>
            <td>${b.qty}</td><td><b>${euros(b.revenue)}</b></td></tr>`).join('') || '<tr><td class="muted">Aucune vente.</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>

  <section class="cards">
    <div class="card">
      <h2>Alertes de stock (≤ 12)</h2>
      <ul class="alerts">
        ${d.lowStock.map((s) => `<li>
          <img src="/studio/${h(s.slug)}.svg" alt="" width="30" height="36">
          <span>${h(s.name)}<em>${h(s.option_value)}</em></span>
          <b>${s.stock}</b>
        </li>`).join('') || '<li class="muted">Tous les stocks sont confortables.</li>'}
      </ul>
    </div>
    <div class="card">
      <h2>Journal des mouvements de stock</h2>
      <table class="table">
        <thead><tr><th>Mouvement</th><th>Déclinaison</th><th>Motif</th></tr></thead>
        <tbody>
          ${d.ledger.map((l) => `<tr>
            <td><b class="${l.delta < 0 ? 'neg' : 'pos'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td>
            <td>${h(l.name)}<br><em class="muted">${h(l.option_value)}</em></td>
            <td class="muted">${h(l.reason)}</td></tr>`).join('') || '<tr><td class="muted">Aucun mouvement.</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}

function ordersView(orders) {
  return `
  <form class="filters" method="get" action="/admin">
    <input type="hidden" name="vue" value="commandes">
    <input name="q" placeholder="Rechercher par référence, nom ou e-mail…" value="">
    <select name="statut">
      <option value="">Tous les statuts</option>
      ${ORDER_STATUSES.map((s) => `<option>${s}</option>`).join('')}
    </select>
    <button class="btn btn--ink" type="submit">Filtrer</button>
  </form>
  <div class="card">
    <table class="table">
      <thead><tr><th>Référence</th><th>Client</th><th>Ville</th><th>Palier</th><th>Code</th><th>Total</th><th>Date</th><th>Statut</th></tr></thead>
      <tbody>
        ${orders.map((o) => `<tr>
          <td><b>${h(o.ref)}</b></td>
          <td>${h(o.first_name)} ${h(o.last_name)}<br><em class="muted">${h(o.email)}</em></td>
          <td>${h(o.city)}</td>
          <td>${h(o.tier_label)}</td>
          <td>${o.promo_code ? `<code>${h(o.promo_code)}</code>` : '<span class="muted">—</span>'}</td>
          <td><b>${euros(o.total_cents)}</b></td>
          <td class="muted">${new Date(o.created_at).toLocaleDateString('fr-FR')}</td>
          <td>
            <form class="inline" method="post" action="/admin/commande">
              <input type="hidden" name="orderId" value="${o.id}">
              <select name="status" onchange="this.form.submit()">
                ${ORDER_STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </form>
          </td>
        </tr>`).join('') || '<tr><td class="muted">Aucune commande.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

function stockView(products) {
  return `
  <div class="card">
    <table class="table">
      <thead><tr><th>Pièce</th><th>Déclinaison</th><th>Prix</th><th>Stock</th><th></th></tr></thead>
      <tbody>
        ${products.flatMap((p) => p.skus.map((sku) => `<tr>
          <td><img src="/studio/${h(p.slug)}.svg" alt="" width="34" height="40"> ${h(p.name)}</td>
          <td>${h(sku.option_value)}</td>
          <td>${euros(sku.price_cents)}</td>
          <td><b class="${sku.stock <= 5 ? 'neg' : ''}">${sku.stock}</b></td>
          <td>
            <form class="inline" method="post" action="/admin/stock">
              <input type="hidden" name="skuId" value="${sku.id}">
              <input name="stock" type="number" min="0" value="${sku.stock}" style="width:88px">
              <button class="btn btn--line btn--sm" type="submit">Ajuster</button>
            </form>
          </td>
        </tr>`)).join('')}
      </tbody>
    </table>
  </div>`;
}

function priceView(products) {
  return `
  <div class="card">
    <table class="table">
      <thead><tr><th>Pièce</th><th>Prix barré</th><th>Prix de vente</th><th>Remise</th><th></th></tr></thead>
      <tbody>
        ${products.map((p) => `<tr>
          <td><img src="/studio/${h(p.slug)}.svg" alt="" width="34" height="40"> ${h(p.name)}<br><em class="muted">${h(p.collectionName)}</em></td>
          <td class="muted">${euros(p.compare_cents)}</td>
          <td><b>${euros(p.price_cents)}</b></td>
          <td>−${p.discount} %</td>
          <td>
            <form class="inline" method="post" action="/admin/prix">
              <input type="hidden" name="productId" value="${p.id}">
              <input name="price" type="number" min="0" step="100" value="${p.price_cents}" style="width:104px">
              <button class="btn btn--line btn--sm" type="submit">Enregistrer</button>
            </form>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function promoView(promos, data) {
  return `
  <section class="cards">
    <div class="card">
      <h2>Créer un code</h2>
      <form class="stack" method="post" action="/admin/promo">
        <label>Code<input name="code" placeholder="NOEL25" required></label>
        <label>Libellé affiché<input name="label" placeholder="−25 % pour les fêtes" required></label>
        <label>Type
          <select name="kind">
            <option value="percent">Pourcentage</option>
            <option value="amount">Montant fixe (centimes)</option>
            <option value="freeship">Livraison offerte</option>
          </select>
        </label>
        <label>Valeur (% ou centimes)<input name="value" type="number" min="0" value="15"></label>
        <label>Minimum d’achat (€)<input name="min" type="number" min="0" value="0"></label>
        <label>Utilisations maximum (0 = illimité)<input name="maxUses" type="number" min="0" value="0"></label>
        <button class="btn btn--ink" type="submit">Créer le code</button>
      </form>
    </div>
    <div class="card card--wide">
      <h2>Codes en circulation</h2>
      <table class="table">
        <thead><tr><th>Code</th><th>Libellé</th><th>Type</th><th>Valeur</th><th>Minimum</th><th>Usages</th><th></th></tr></thead>
        <tbody>
          ${promos.map((p) => `<tr>
            <td><code>${h(p.code)}</code></td>
            <td>${h(p.label)}</td>
            <td>${p.kind === 'percent' ? 'Pourcentage' : p.kind === 'amount' ? 'Montant' : 'Port offert'}</td>
            <td>${p.kind === 'percent' ? `−${p.value} %` : p.kind === 'amount' ? euros(p.value) : '—'}</td>
            <td>${p.min_cents ? euros(p.min_cents) : '—'}</td>
            <td>${p.uses}${p.max_uses ? ` / ${p.max_uses}` : ''}</td>
            <td>
              <form method="post" action="/admin/promo">
                <input type="hidden" name="code" value="${h(p.code)}">
                <button class="btn btn--line btn--sm" type="submit" name="remove" value="1">Supprimer</button>
              </form>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      <h2 style="margin-top:26px">Remises volumiques automatiques</h2>
      <p class="muted">Ces paliers s’appliquent sans code : −15 % dès 2 pièces, −25 % dès 3, −30 % dès 5. Plafond global de remise : 40 %.</p>
      <ul class="bars">
        ${data.byTier.map((t) => `<li><span>${h(t.tier_label)}</span><b>${t.orders}</b><em>commande(s)</em></li>`).join('')}
      </ul>
    </div>
  </section>`;
}

function clientsView(newsletter) {
  return `
  <div class="card">
    <h2>Inscrits à la newsletter</h2>
    <table class="table">
      <thead><tr><th>E-mail</th><th>Source</th><th>Inscription</th></tr></thead>
      <tbody>
        ${newsletter.map((n) => `<tr>
          <td><b>${h(n.email)}</b></td>
          <td>${h(n.source)}</td>
          <td class="muted">${new Date(n.created_at).toLocaleString('fr-FR')}</td>
        </tr>`).join('') || '<tr><td class="muted">Aucun inscrit pour l’instant.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}
