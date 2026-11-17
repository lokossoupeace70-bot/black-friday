/**
 * smoke-test.js — parcours complet du site rendu serveur.
 * Lance : `npm test` (le serveur démarre dans le même processus).
 */
import { server } from '../server/index.js';
import { skuById } from '../server/store.js';

await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
const jar = new Map();

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function request(path, { method = 'GET', body, headers = {}, follow = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: follow ? 'follow' : 'manual',
    headers: {
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  for (const cookie of res.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const idx = pair.indexOf('=');
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), text, type: res.headers.get('content-type') || '' };
}

const get = (path, options) => request(path, options);
const post = (path, body, options = {}) =>
  request(path, { method: 'POST', body, headers: { Origin: BASE, ...(options.headers || {}) }, ...options });

function check(name, ok, info = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${info ? ` — ${info}` : ''}`);
}

/** Un site rendu serveur ne doit jamais laisser fuir de valeur non résolue. */
function clean(name, text) {
  const leaks = [];
  if (/\bundefined\b/.test(text)) leaks.push('undefined');
  if (/\bNaN\b/.test(text)) leaks.push('NaN');
  if (/\{\{/.test(text)) leaks.push('template non résolu');
  if (/\[object Object\]/.test(text)) leaks.push('[object Object]');
  if (text.includes('0,00 €') && !/gratuit|offert/i.test(text)) leaks.push('prix à 0,00 €');
  check(`${name} : rendu propre`, leaks.length === 0, leaks.join(', '));
  return leaks.length === 0;
}

console.log(`\n🔎 Parcours Maison Noire sur ${BASE}\n`);

try {
  /* ------------------------------------------------------------- vitrine */
  const home = await get('/');
  check('accueil servi', home.status === 200 && home.text.includes('NOIRE'));
  clean('accueil', home.text);
  check('accueil : paliers expliqués', home.text.includes('−15') && home.text.includes('−25') && home.text.includes('−30'));
  check('cookie de session posé', jar.size > 0, cookieHeader().slice(0, 24) + '…');

  const boutique = await get('/boutique');
  clean('boutique', boutique.text);
  check('boutique liste les pièces', (boutique.text.match(/class="piece"/g) || []).length >= 12,
    `${(boutique.text.match(/class="piece"/g) || []).length} pièces`);

  const collection = await get('/collection/parfums-bougies');
  clean('collection', collection.text);
  check('collection filtrée', collection.text.includes('Parfums &amp; bougies') && collection.text.includes('class="piece"'));

  const search = await get('/boutique?q=plaid');
  check('recherche plein texte', search.text.includes('Plaid') && search.text.includes('résultat'));

  const sorted = await get('/boutique?tri=remise');
  check('tri par remise', sorted.status === 200);

  /* -------------------------------------------------------------- produit */
  const productPage = await get('/produit/bougie-noire-absolue');
  check('fiche produit servie', productPage.status === 200 && productPage.text.includes('Bougie Noire Absolue'));
  clean('fiche produit', productPage.text);

  const skuIds = [...productPage.text.matchAll(/name="skuId" value="(\d+)"/g)].map((m) => m[1]);
  check('déclinaisons proposées', skuIds.length >= 2, `${skuIds.length} déclinaisons`);

  const art = await fetch(`${BASE}/studio/bougie-noire-absolue.svg`);
  const artColored = await fetch(`${BASE}/studio/bougie-noire-absolue.svg?v=Coffret%20de%202`);
  check('visuel studio généré', art.status === 200 && (art.headers.get('content-type') || '').includes('image/svg+xml'));
  check('la déclinaison change le visuel', (await art.text()) !== (await artColored.text()));

  const want = await get('/studio/inexistant.svg');
  check('visuel inconnu → 404', want.status === 404);

  /* --------------------------------------------------------------- panier */
  const emptyCart = await get('/panier');
  check('panier vide géré', emptyCart.status === 200 && emptyCart.text.includes('vide'));
  clean('panier vide', emptyCart.text);

  const add1 = await post('/panier/ajouter', { skuId: skuIds[0], qty: '1' });
  check('ajout au panier → redirection', add1.status === 303 && !!add1.location, add1.location);

  const cart1 = await get('/panier');
  check('une pièce = palier « Pièce seule »', cart1.text.includes('Pièce seule'));
  check('aucune remise volumique à 1 pièce', !cart1.text.includes('Remise Duo'));
  clean('panier 1 pièce', cart1.text);

  const other = await get('/boutique?q=coussin');
  const otherSku = [...other.text.matchAll(/href="\/produit\/([a-z0-9-]+)"/g)][0][1];
  const otherProduct = await get(`/produit/${otherSku}`);
  const otherSkuId = [...otherProduct.text.matchAll(/name="skuId" value="(\d+)"/g)][0][1];
  await post('/panier/ajouter', { skuId: otherSkuId, qty: '1' });

  const cart2 = await get('/panier');
  check('2 pièces → remise Duo −15 %', cart2.text.includes('Duo') && cart2.text.includes('−15'), 'palier Duo');
  check('remise volumique chiffrée', /Remise Duo[^<]*<\/dt><dd>−/.test(cart2.text));
  check('invitation au palier suivant', cart2.text.includes('−25') && /Encore <b>1 pièce<\/b>/.test(cart2.text),
    (cart2.text.match(/Encore <b>[^<]+<\/b> → <b>[^<]+<\/b>/) || [])[0] || '');
  clean('panier 2 pièces', cart2.text);

  /* ---------------------------------------------------------- montée de palier */
  const lineIds = [...cart2.text.matchAll(/name="lineId" value="(\d+)"/g)].map((m) => m[1]);
  await post('/panier/modifier', { lineId: lineIds[0], qty: '4' });
  const cart5 = await get('/panier');
  check('5 pièces → palier Coffret −30 %', cart5.text.includes('−30') && cart5.text.includes('Coffret complet'));
  clean('panier palier maximal', cart5.text);
  check('livraison offerte au-delà de 90 €', cart5.text.includes('Offerte'));
  check('palier maximal : plus d’invitation à monter', !cart5.text.includes('Pour passer à'));

  /* ---------------------------------------------------------------- promo */
  const badPromo = await post('/panier/promo', { code: 'NIMPORTEQUOI' });
  check('code inconnu refusé', badPromo.status === 303 && badPromo.location.includes('promoechec'), badPromo.location);

  const promo = await post('/panier/promo', { code: 'maison20' });
  check('code MAISON20 accepté (insensible à la casse)', promo.status === 303 && promo.location.includes('code=MAISON20'), promo.location);

  const cartPromo = await get(promo.location);
  check('remise du code affichée et chiffrée', cartPromo.text.includes('Code MAISON20') && /Code MAISON20<\/dt><dd>−/.test(cartPromo.text));
  clean('panier avec code', cartPromo.text);

  const tooLowPromo = await post('/panier/promo', { code: 'BLACK30' });
  check('minimum d’achat respecté', tooLowPromo.location.includes('promoechec'),
    decodeURIComponent(tooLowPromo.location).split('detail=')[1] || '');

  const stockBefore = skuById(Number(skuIds[0])).stock;

  /* ------------------------------------------------------------- commande */
  const invalid = await post('/commande', { promoCode: 'MAISON20', firstName: '', email: 'pas-un-email', terms: '' });
  check('validation de commande (champs manquants)', invalid.status === 422 && invalid.text.includes('Adresse e-mail invalide'));
  check('validation : conditions de vente', invalid.text.includes('accepter les conditions'));
  clean('commande invalide', invalid.text);

  const valid = await post('/commande', {
    promoCode: 'MAISON20',
    firstName: 'Camille', lastName: 'Perrin', email: 'camille.perrin@example.fr',
    phone: '0612345678', address: '18 rue des Tisserands', zip: '69003', city: 'Lyon',
    giftWrap: '1', giftMessage: 'Pour Claire, avec toute mon affection.', terms: '1',
  });
  check('commande créée → redirection', valid.status === 303 && /\/confirmation\/MN-2026-\d+/.test(valid.location || ''), valid.location);

  const ref = valid.location.split('/').pop();
  const confirmation = await get(valid.location);
  check('page de confirmation', confirmation.status === 200 && confirmation.text.includes(ref));
  clean('confirmation', confirmation.text);
  check('emballage cadeau facturé', confirmation.text.includes('Emballage cadeau') && confirmation.text.includes('Message de la carte'));
  check('remise palier reportée sur la commande', confirmation.text.includes('Remise Coffret complet'));

  const emptied = await get('/panier');
  check('panier vidé après commande', emptied.text.includes('vide'));

  /* ----------------------------------------------------------------- suivi */
  const tracking = await get(`/suivi?ref=${ref}&email=camille.perrin@example.fr`);
  check('suivi de commande', tracking.status === 200 && tracking.text.includes(ref) && tracking.text.includes('en atelier'));
  clean('suivi', tracking.text);

  const trackingKo = await get(`/suivi?ref=${ref}&email=mauvais@example.fr`);
  check('suivi protégé par e-mail', trackingKo.text.includes('Aucune commande ne correspond'));

  /* ---------------------------------------------------------------- stock */
  const afterSale = await get('/produit/bougie-noire-absolue');
  const stockAfter = skuById(Number(skuIds[0])).stock;
  check('stock décrémenté à la vente', stockAfter === stockBefore - 4,
    `${stockBefore} → ${stockAfter} (−4 attendus)`);
  check('fiche produit toujours propre', clean('fiche après achat', afterSale.text));

  /* -------------------------------------------------------------- favoris */
  const favBefore = await get('/favoris');
  check('page favoris vide', favBefore.text.includes('Aucun favori'));

  const favPost = await post('/favoris/basculer', { productId: '1' });
  check('ajout aux favoris → redirection', favPost.status === 303);

  const favAfter = await get('/favoris');
  check('favori enregistré', favAfter.text.includes('class="piece"'));
  clean('favoris', favAfter.text);

  const favJson = await post('/favoris/basculer', { productId: '1' }, { headers: { Accept: 'application/json' } });
  check('API favoris en JSON', favJson.status === 200 && JSON.parse(favJson.text).added === false, favJson.text);

  /* ------------------------------------------------------------ newsletter */
  const news = await post('/newsletter', { email: 'lecteur@example.fr' });
  check('inscription newsletter', news.status === 303 && (news.location || '').includes('msg=newsletter'));

  const newsKo = await post('/newsletter', { email: 'pasunemail' });
  check('e-mail invalide rejeté', (newsKo.location || '').includes('promoechec'));

  /* ------------------------------------------------------------- éditorial */
  for (const path of ['/journal', '/maison', '/favoris', '/panier']) {
    const page = await get(path);
    clean(path, page.text);
  }
  check('journal accessible', (await get('/journal')).text.includes('Journal'));
  check('page maison accessible', (await get('/maison')).text.includes('deux ateliers'));

  /* --------------------------------------------------------------- erreurs */
  const missing = await get('/cette-page-nexiste-pas');
  check('404 habillée', missing.status === 404 && missing.text.includes('NOIRE'));

  const product404 = await get('/produit/nexiste-pas');
  check('produit inconnu → 404', product404.status === 404);

  const method = await request('/', { method: 'POST', body: {} });
  check('méthode non autorisée → 405', method.status === 405);

  /* ------------------------------------------------------------------ CSRF */
  const crossSite = await fetch(`${BASE}/panier/ajouter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://attaquant.example' },
    body: new URLSearchParams({ skuId: skuIds[0], qty: '1' }).toString(),
    redirect: 'manual',
  });
  check('origine tierce refusée', crossSite.status === 403);

  /* ----------------------------------------------------------------- admin */
  const loginPage = await get('/admin');
  check('back-office protégé', loginPage.status === 200 && loginPage.text.includes('Mot de passe atelier'));

  const badLogin = await post('/admin/connexion', { password: 'faux' });
  check('mot de passe refusé', badLogin.status === 303 && badLogin.location.includes('refuse'));

  const goodLogin = await post('/admin/connexion', { password: process.env.ADMIN_PASSWORD || 'maisonnoire2026' });
  check('connexion back-office', goodLogin.status === 303 && goodLogin.location === '/admin');

  const console_ = await get('/admin');
  check('console ouverte', console_.status === 200 && console_.text.includes('Chiffre d’affaires'));
  clean('console tableau de bord', console_.text);

  for (const view of ['commandes', 'stock', 'prix', 'promos', 'clients']) {
    const page = await get(`/admin?vue=${view}`);
    check(`onglet back-office « ${view} »`, page.status === 200, `${page.text.length} octets`);
    clean(`console ${view}`, page.text);
  }

  const stockUpdate = await post('/admin/stock', { skuId: skuIds[0], stock: '7' });
  check('ajustement de stock', stockUpdate.status === 303);

  const afterAdjust = await get('/produit/bougie-noire-absolue');
  check('nouveau stock appliqué', afterAdjust.text.includes('>7 en stock<'));
  check('mouvement journalisé', (await get('/admin')).text.includes('ajustement back-office'));

  const priceUpdate = await post('/admin/prix', { productId: '1', price: '3900' });
  check('changement de prix', priceUpdate.status === 303);
  check('prix affiché mis à jour', (await get('/produit/bougie-noire-absolue')).text.includes('39,00'));

  // On évite « NOEL25 », qui traîne dans un placeholder du formulaire admin.
  const promoCreate = await post('/admin/promo', { code: 'FESTIF25', label: '−25 % pour les fêtes', kind: 'percent', value: '25', min: '100', maxUses: '50' });
  check('création de code depuis le back-office', promoCreate.status === 303);
  check('code visible en boutique admin', (await get('/admin?vue=promos')).text.includes('FESTIF25'));

  const promoDelete = await post('/admin/promo', { code: 'FESTIF25', remove: '1' });
  check('suppression de code', promoDelete.status === 303 && !(await get('/admin?vue=promos')).text.includes('FESTIF25'));

  /* ------------------------------------------------------------- fichiers */
  for (const asset of ['/theme.css', '/admin.css', '/interactions.js']) {
    const res = await fetch(BASE + asset);
    check(`ressource ${asset}`, res.status === 200 && (res.headers.get('content-type') || '').length > 0);
  }
  const traversal = await fetch(`${BASE}/theme.css`, { headers: { Range: 'bytes=0-10' } });
  check('ressource servie avec revalidation', traversal.headers.get('cache-control') === 'no-cache');
} catch (error) {
  console.error('\n💥 Erreur pendant le test :', error);
  process.exitCode = 1;
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} vérifications réussies`);
if (failed.length) {
  console.log('Échecs :');
  for (const f of failed) console.log(`   · ${f.name}`);
  process.exitCode = 1;
}

server.close();
setTimeout(() => process.exit(process.exitCode || 0), 120);
