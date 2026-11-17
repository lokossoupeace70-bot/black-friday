/**
 * store.js — données de la Maison.
 *
 * Différence assumée avec la boutique tech : le stock est tenu au niveau du SKU
 * (une déclinaison = un stock), chaque mouvement de stock est journalisé, et le
 * catalogue est organisé en collections éditoriales.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, slugify, hashInt } from './http.js';

export const DB_PATH = process.env.MN_DB || path.join(DATA_DIR, 'maison.sqlite');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/* ================================================================ SCHÉMA == */

db.exec(`
CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  kicker      TEXT NOT NULL DEFAULT '',
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  collection_id INTEGER NOT NULL REFERENCES collections(id),
  notes         TEXT NOT NULL DEFAULT '',
  story         TEXT NOT NULL DEFAULT '',
  materials     TEXT NOT NULL DEFAULT '[]',
  care          TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER NOT NULL,
  compare_cents INTEGER NOT NULL,
  rating        REAL NOT NULL DEFAULT 4.8,
  review_count  INTEGER NOT NULL DEFAULT 0,
  sold_week     INTEGER NOT NULL DEFAULT 0,
  edition       TEXT NOT NULL DEFAULT '',
  featured      INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_collection ON products(collection_id);

CREATE TABLE IF NOT EXISTS skus (
  id           INTEGER PRIMARY KEY,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code         TEXT UNIQUE NOT NULL,
  option_name  TEXT NOT NULL DEFAULT 'Finition',
  option_value TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_skus_product ON skus(product_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  rating     INTEGER NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

CREATE TABLE IF NOT EXISTS carts (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_lines (
  id       INTEGER PRIMARY KEY,
  token    TEXT NOT NULL,
  sku_id   INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  qty      INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  UNIQUE(token, sku_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  token      TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (token, product_id)
);

CREATE TABLE IF NOT EXISTS promos (
  code      TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  kind      TEXT NOT NULL,
  value     INTEGER NOT NULL DEFAULT 0,
  min_cents INTEGER NOT NULL DEFAULT 0,
  max_uses  INTEGER NOT NULL DEFAULT 0,
  uses      INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY,
  ref                   TEXT UNIQUE NOT NULL,
  email                 TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  address               TEXT NOT NULL,
  zip                   TEXT NOT NULL,
  city                  TEXT NOT NULL,
  country               TEXT NOT NULL DEFAULT 'France',
  phone                 TEXT NOT NULL DEFAULT '',
  gift_wrap             INTEGER NOT NULL DEFAULT 0,
  gift_message          TEXT NOT NULL DEFAULT '',
  subtotal_cents        INTEGER NOT NULL,
  bundle_discount_cents INTEGER NOT NULL DEFAULT 0,
  promo_discount_cents  INTEGER NOT NULL DEFAULT 0,
  shipping_cents        INTEGER NOT NULL DEFAULT 0,
  tax_cents             INTEGER NOT NULL DEFAULT 0,
  total_cents           INTEGER NOT NULL,
  promo_code            TEXT NOT NULL DEFAULT '',
  tier_label            TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'en atelier',
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);

CREATE TABLE IF NOT EXISTS order_lines (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id       INTEGER NOT NULL,
  product_slug TEXT NOT NULL,
  name         TEXT NOT NULL,
  option       TEXT NOT NULL DEFAULT '',
  unit_cents   INTEGER NOT NULL,
  qty          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS newsletter (
  email      TEXT PRIMARY KEY,
  source     TEXT NOT NULL DEFAULT 'site',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id         INTEGER PRIMARY KEY,
  sku_id     INTEGER NOT NULL,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

export const ORDER_STATUSES = ['en atelier', 'expédiée', 'livrée', 'annulée'];

/* ============================================================== CATALOGUE == */

const COLLECTIONS = [
  ['parfums-bougies', 'Parfums & Bougies', 'Signatures olfactives', 'Le parfum comme mémoire d’une pièce.', 'Compositions créées à Grasse, coulées à la main dans notre atelier de Lyon. Aucun colorant, aucune cire de paraffine.'],
  ['textile-plaid', 'Textile & Plaid', 'Laine des Pyrénées', 'Le confort qui se transmet.', 'Tissages français, laine traçable, finitions à la main. Des pièces faites pour vieillir joliment.'],
  ['luminaires', 'Luminaires', 'Lumière sculptée', 'Éclairer sans éblouir.', 'Laiton massif, acier thermolaqué, câblage textile. Chaque luminaire est monté puis testé à l’unité.'],
  ['art-de-la-table', 'Art de la table', 'Le geste du service', 'Recevoir, simplement.', 'Verre soufflé bouche, grès émaillé, laiton tourné. Compatible lave-vaisselle pour un usage quotidien.'],
  ['maroquinerie', 'Maroquinerie', 'Cuirs pleine fleur', 'Vieillir sans s’user.', 'Cuirs tannés végétal, cousus sellier, doublure coton. Réparables à vie dans notre atelier.'],
  ['horlogerie', 'Horlogerie', 'Mécanique', 'Le temps, patiemment.', 'Mouvements automatiques réglés en cinq positions, verre saphir bombé, garantie internationale.'],
];

/** Un objet = un produit + ses déclinaisons réelles (chacune avec son stock). */
const CATALOG = [
  // ---- Parfums & Bougies
  {
    name: 'Bougie Noire Absolue', collection: 'parfums-bougies', price: 4900, compare: 8900,
    notes: 'Oud · Vétiver · Poivre noir', edition: 'Signature',
    story: 'Un oud fumé adouci d’une pointe de vanille noire : la pièce qui a fait notre réputation.',
    materials: ['Cire de colza française', 'Mèche coton tressée', 'Verre soufflé à la main'],
    care: 'Coupez la mèche à 5 mm avant chaque allumage. 48 heures de combustion parfaite.',
    rating: 4.9, reviews: 412, soldWeek: 168, featured: true,
    values: [['180 g', 4900, 64], ['420 g', 7900, 38], ['Coffret de 2', 13900, 12]],
  },
  {
    name: 'Diffuseur Bâton Noir', collection: 'parfums-bougies', price: 3900, compare: 6900,
    notes: 'Cèdre · Cardamome · Musc blanc', edition: '',
    story: 'Huit semaines de diffusion continue, sans électricité et sans flamme.',
    materials: ['Base alcool de blé', 'Bâtons en rotin', 'Flacon verre ambré'],
    care: 'Retournez les bâtons une fois par semaine pour raviver la note de tête.',
    rating: 4.7, reviews: 238, soldWeek: 96, featured: false,
    values: [['200 ml', 3900, 71], ['500 ml', 6900, 34]],
  },
  {
    name: 'Parfum d’Intérieur Vétiver', collection: 'parfums-bougies', price: 4200, compare: 7400,
    notes: 'Vétiver · Bergamote · Poivre', edition: '',
    story: 'Le souffle vert et boisé qui accompagne les entrées de maison.',
    materials: ['Essence de vétiver d’Haïti', 'Flacon verre dépoli', 'Pompe laiton'],
    care: 'Deux pressions suffisent pour 12 m². Conserver à l’abri de la lumière.',
    rating: 4.6, reviews: 176, soldWeek: 74, featured: false,
    values: [['250 ml', 4200, 55], ['Recharge', 2900, 90]],
  },
  {
    name: 'Coffret Rituel du Soir', collection: 'parfums-bougies', price: 8900, compare: 14900,
    notes: 'Bougie · Diffuseur · Senteur', edition: 'Bois de cèdre',
    story: 'Trois gestes pour installer le calme, réunis dans un coffret prêt à offrir.',
    materials: ['Coffret bois de cèdre', 'Étiquettes gravées', 'Ruban coton recyclé'],
    care: 'Coffret recyclable, étiquettes repositionnables, notice parfumage incluse.',
    rating: 4.9, reviews: 143, soldWeek: 88, featured: true,
    values: [['Coffret 3 pièces', 8900, 26], ['Coffret 5 pièces', 13900, 14]],
  },

  // ---- Textile & Plaid
  {
    name: 'Plaid Laine des Pyrénées', collection: 'textile-plaid', price: 14900, compare: 24900,
    notes: 'Laine vierge 92 %', edition: 'Trame chevron',
    story: 'Tissé sur des métiers à navette à Lavelanet, bordé à la main point par point.',
    materials: ['Laine vierge traçable', 'Ourlet piqué main', 'Étiquette tissée'],
    care: 'Lavage à 30 °C programme laine. Séchage à plat, sans adoucissant.',
    rating: 4.8, reviews: 306, soldWeek: 121, featured: true,
    values: [['130 × 180 cm', 14900, 22], ['200 × 240 cm', 24900, 11]],
  },
  {
    name: 'Coussin Lin Lavé', collection: 'textile-plaid', price: 5900, compare: 9900,
    notes: 'Lin européen 100 %', edition: 'Écru lavé',
    story: 'Un lin assoupli par trois lavages successifs, qui ne gratte jamais.',
    materials: ['Lin européen lavé', 'Fermeture passepoilée', 'Garnissage boule de polyester recyclé'],
    care: 'Housse déhoussable, lavage à 40 °C. Tapoter pour redonner du volume.',
    rating: 4.5, reviews: 188, soldWeek: 143, featured: false,
    values: [['40 × 40 cm', 5900, 48], ['50 × 50 cm', 7900, 31]],
  },
  {
    name: 'Parure de Lit Percale 300', collection: 'textile-plaid', price: 18900, compare: 28900,
    notes: 'Percale 300 fils', edition: 'Blanc cassé',
    story: 'Une percale dense et fraîche, qui gagne en douceur à chaque lavage.',
    materials: ['Coton peigné longues fibres', 'Percale 300 fils', 'Housse boutonnée nacre'],
    care: 'Lavage 60 °C, repassage à chaud sur l’envers, aucun javel.',
    rating: 4.7, reviews: 224, soldWeek: 67, featured: false,
    values: [['140 × 200 cm', 18900, 16], ['200 × 200 cm', 21900, 9]],
  },
  {
    name: 'Couverture Cachemire', collection: 'textile-plaid', price: 34900, compare: 49900,
    notes: 'Cachemire 100 % 2 fils', edition: 'Série limitée 120',
    story: 'Deux fils de cachemire mongol, pour une chaleur sans poids.',
    materials: ['Cachemire 100 %', 'Ponchage manuel', 'Boîte cadeau incluse'],
    care: 'Nettoyage à sec uniquement. Brosser dans le sens du poil.',
    rating: 4.9, reviews: 97, soldWeek: 29, featured: true,
    values: [['Écru', 34900, 7], ['Ardoise', 34900, 5]],
  },

  // ---- Luminaires
  {
    name: 'Lampe Sculpture Grand', collection: 'luminaires', price: 24900, compare: 39900,
    notes: 'Laiton massif brossé', edition: 'Pièce numérotée',
    story: 'Une base tournée dans la masse, un diffuseur opalin soufflé à la bouche.',
    materials: ['Laiton massif', 'Diffuseur opalin', 'Câble textile tressé 2 m'],
    care: 'Dépoussiérer au chiffon doux. Ampoule E27 LED fournie (2700 K).',
    rating: 4.8, reviews: 114, soldWeek: 38, featured: true,
    values: [['Noire', 24900, 13], ['Laiton', 31900, 6]],
  },
  {
    name: 'Applique Ardoise', collection: 'luminaires', price: 12900, compare: 19900,
    notes: 'Acier thermolaqué', edition: '',
    story: 'Discrète de jour, elle dessine deux cônes de lumière rasante le soir.',
    materials: ['Acier thermolaqué mat', 'Fixation murale cachée', 'IP44'],
    care: 'Réservée à un usage intérieur, hors pièce d’eau directe.',
    rating: 4.4, reviews: 86, soldWeek: 52, featured: false,
    values: [['Ardoise', 12900, 24]],
  },
  {
    name: 'Lampe Nomade Noire', collection: 'luminaires', price: 8900, compare: 14900,
    notes: 'Sans fil, 40 h', edition: '',
    story: 'Elle suit la maison : table, terrasse, salle de bain, sans jamais de câble.',
    materials: ['Aluminium anodisé', 'Batterie 5 200 mAh', 'Charge USB-C'],
    care: 'Recharge complète en 3 h. Indice de protection IP54.',
    rating: 4.6, reviews: 251, soldWeek: 162, featured: false,
    values: [['1 lampe', 8900, 41], ['2 lampes', 15900, 17]],
  },
  {
    name: 'Suspension Dôme Laiton', collection: 'luminaires', price: 31900, compare: 44900,
    notes: 'Diamètre 45 cm', edition: '',
    story: 'Un dôme profond qui concentre la lumière sur la table, jamais dans les yeux.',
    materials: ['Laiton non verni', 'Intérieur blanc laqué', 'Chaîne réglable'],
    care: 'Le laiton se patine naturellement. Polir si vous préférez le brillant.',
    rating: 4.7, reviews: 73, soldWeek: 21, featured: false,
    values: [['Laiton', 31900, 8]],
  },

  // ---- Art de la table
  {
    name: 'Service à Eau 6 pièces', collection: 'art-de-la-table', price: 8900, compare: 13900,
    notes: 'Verre soufflé bouche', edition: '',
    story: 'Six verres légèrement différents : la signature du soufflage à la bouche.',
    materials: ['Verre soufflé bouche', 'Bord adouci au feu', 'Lave-vaisselle compatible'],
    care: 'Éviter les chocs thermiques. Lavage à 60 °C maximum.',
    rating: 4.6, reviews: 167, soldWeek: 94, featured: false,
    values: [['6 verres', 8900, 29]],
  },
  {
    name: 'Carafe Soufflée', collection: 'art-de-la-table', price: 6900, compare: 10900,
    notes: '1,2 litre', edition: '',
    story: 'Une carafe qui laisse respirer le vin et le met en lumière.',
    materials: ['Verre transparent soufflé', 'Col étroit anti-goutte', 'Base large stabilisée'],
    care: 'Rinçage immédiat après usage, séchage tête en bas.',
    rating: 4.5, reviews: 132, soldWeek: 88, featured: false,
    values: [['1,2 L', 6900, 37]],
  },
  {
    name: 'Set Couverts 16 pièces', collection: 'art-de-la-table', price: 15900, compare: 23900,
    notes: 'Acier 18/10 forgé', edition: '',
    story: 'Forgé d’une seule pièce : l’équilibre en main ne bouge pas avec le temps.',
    materials: ['Acier inoxydable 18/10', 'Finition satinée', 'Lave-vaisselle compatible'],
    care: 'Éviter le trempage prolongé pour préserver la finition satinée.',
    rating: 4.8, reviews: 209, soldWeek: 76, featured: true,
    values: [['16 pièces', 15900, 19], ['24 pièces', 22900, 11]],
  },
  {
    name: 'Plateau Marbre & Laiton', collection: 'art-de-la-table', price: 11900, compare: 18900,
    notes: 'Marbre de Carrare', edition: '',
    story: 'Un plateau lourd, stable, dont le marbre est unique à chaque pièce.',
    materials: ['Marbre de Carrare', 'Poignées laiton massif', 'Feutrine protectrice'],
    care: 'Nettoyer avec un chiffon humide, éviter les agrumes et le vinaigre.',
    rating: 4.6, reviews: 118, soldWeek: 61, featured: false,
    values: [['40 × 28 cm', 11900, 23]],
  },

  // ---- Maroquinerie
  {
    name: 'Cabas Noir Grainé', collection: 'maroquinerie', price: 44900, compare: 69900,
    notes: 'Cuir pleine fleur tanné végétal', edition: 'Cousu sellier',
    story: 'Un cabas qui tient debout tout seul, et qui se répare à vie à l’atelier.',
    materials: ['Cuir pleine fleur', 'Doublure coton écru', 'Pièces de fermeture laiton'],
    care: 'Nourrir le cuir deux fois par an avec un baume incolore.',
    rating: 4.9, reviews: 173, soldWeek: 44, featured: true,
    values: [['Noir', 44900, 9], ['Cognac', 44900, 6]],
  },
  {
    name: 'Portefeuille Zippé', collection: 'maroquinerie', price: 12900, compare: 19900,
    notes: '8 cartes · 2 compartiments', edition: '',
    story: 'Fermeture zippée périphérique : rien ne tombe, jamais.',
    materials: ['Cuir pleine fleur', 'Zip laiton YKK', 'Doublure cuir'],
    care: 'Chiffon sec. Ne pas surcharger pour garder la forme.',
    rating: 4.7, reviews: 241, soldWeek: 132, featured: false,
    values: [['Noir', 12900, 34], ['Cognac', 12900, 21]],
  },
  {
    name: 'Pochette Nuit', collection: 'maroquinerie', price: 8900, compare: 16900,
    notes: 'Bandoulière amovible', edition: '',
    story: 'L’essentiel du soir, sans compromis sur la qualité du cuir.',
    materials: ['Cuir de veau nappa', 'Chaîne laiton', 'Bandoulière réglable'],
    care: 'Ranger dans sa housse pour éviter les marques de chaîne.',
    rating: 4.5, reviews: 154, soldWeek: 98, featured: false,
    values: [['Noir', 8900, 42]],
  },
  {
    name: 'Ceinture Cuir Tressé', collection: 'maroquinerie', price: 7900, compare: 12900,
    notes: 'Boucle laiton massif', edition: '',
    story: 'Tressée main, elle se patine et prend la forme du porteur.',
    materials: ['Cuir tressé main', 'Boucle laiton massif', 'Longueur ajustable'],
    care: 'Coupe possible à l’atelier, sur demande et gratuitement.',
    rating: 4.4, reviews: 129, soldWeek: 71, featured: false,
    values: [['85 cm', 7900, 18], ['95 cm', 7900, 15]],
  },

  // ---- Horlogerie
  {
    name: 'Montre Automatique Noire', collection: 'horlogerie', price: 89900, compare: 129000,
    notes: 'Mouvement automatique · 42 h', edition: 'Édition 200 pièces',
    story: 'Un boîtier 39 mm, un mouvement réglé en cinq positions, un verre saphir bombé.',
    materials: ['Boîtier acier 316L', 'Verre saphir bombé', 'Étanche 100 m'],
    care: 'Révision conseillée tous les cinq ans. Garantie internationale 3 ans.',
    rating: 4.8, reviews: 88, soldWeek: 16, featured: true,
    values: [['Bracelet cuir', 89900, 5], ['Bracelet acier', 97900, 3]],
  },
  {
    name: 'Montre Fine Acier', collection: 'horlogerie', price: 34900, compare: 49900,
    notes: 'Quartz haute précision', edition: '',
    story: '34 mm, 6,8 mm d’épaisseur : la montre qu’on oublie au poignet.',
    materials: ['Acier 316L brossé', 'Cadran soleillé', 'Verre saphir'],
    care: 'Pile 5 ans, remplacée gratuitement en boutique.',
    rating: 4.6, reviews: 137, soldWeek: 52, featured: false,
    values: [['34 mm', 34900, 12]],
  },
  {
    name: 'Bracelet Cuir Italien', collection: 'horlogerie', price: 5900, compare: 9900,
    notes: 'Cuir de Toscane', edition: '',
    story: 'Une lanière qui transforme une montre en tenue du soir.',
    materials: ['Cuir toscan tannage végétal', 'Boucle acier signée', 'Boucles à ressort fournies'],
    care: 'Compatible toutes montres à cornes standard 20 et 22 mm.',
    rating: 4.5, reviews: 96, soldWeek: 64, featured: false,
    values: [['20 mm', 5900, 44], ['22 mm', 5900, 36]],
  },
  {
    name: 'Coffret Montre & Bracelet', collection: 'horlogerie', price: 39900, compare: 59900,
    notes: 'Montre · Bracelet · Coffret', edition: '',
    story: 'La montre, sa lanière de rechange et l’écrin : le cadeau sans hésitation.',
    materials: ['Montre acier 38 mm', 'Bracelet supplémentaire', 'Écrin cuir'],
    care: 'Emballage cadeau offert sur cette référence pendant la campagne.',
    rating: 4.7, reviews: 74, soldWeek: 31, featured: true,
    values: [['Écrin complet', 39900, 9]],
  },
];

const REVIEW_POOL = [
  ['Claire V.', 'Nantes', 5, 'Qualité irréprochable', 'Reçue en trois jours, emballée comme une pièce de collection. Le rendu en vrai est encore meilleur que sur les photos.'],
  ['Hugo P.', 'Lille', 5, 'Objet qui traverse les années', 'Je l’utilise tous les jours depuis deux mois, aucune marque d’usure. On sent l’assemblage soigné.'],
  ['Amina T.', 'Marseille', 4, 'Très belle finition', 'La fabrication est sérieuse. Petit bémol : la livraison a pris un jour de plus que prévu.'],
  ['Benoît L.', 'Strasbourg', 5, 'Cadeau parfait', 'Offert pour un anniversaire, le coffret a fait son effet. Le service client a répondu en une heure.'],
  ['Inès D.', 'Bordeaux', 5, 'Vaut son prix', 'J’ai comparé avec deux marques du même segment : la qualité est au-dessus, pour moins cher pendant la campagne.'],
  ['Paul R.', 'Rennes', 4, 'Solide et élégant', 'Discret, bien pensé, sans logo ostentatoire. Exactement ce que je cherchais.'],
  ['Sophie M.', 'Toulouse', 5, 'Fabrication française assumée', 'Atelier français, matériaux traçables : c’est ce qui m’a convaincue, et je ne suis pas déçue.'],
  ['Karim B.', 'Paris', 4, 'Très satisfait', 'L’objet est lourd et bien équilibré. La notice aurait pu être plus détaillée.'],
];

/* ================================================================ SEEDING == */

export function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n > 0) return false;

  const now = new Date().toISOString();
  const insertCollection = db.prepare('INSERT INTO collections (slug, name, kicker, tagline, description, position) VALUES (?,?,?,?,?,?)');
  const insertProduct = db.prepare(`INSERT INTO products
    (slug, name, collection_id, notes, story, materials, care, price_cents, compare_cents, rating, review_count, sold_week, edition, featured, position, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertSku = db.prepare('INSERT INTO skus (product_id, code, option_name, option_value, price_cents, stock, position) VALUES (?,?,?,?,?,?,?)');
  const insertReview = db.prepare('INSERT INTO reviews (product_id, author, city, rating, title, body, created_at) VALUES (?,?,?,?,?,?,?)');

  db.exec('BEGIN');
  try {
    const collectionIds = {};
    COLLECTIONS.forEach(([slug, name, kicker, tagline, description], i) => {
      const info = insertCollection.run(slug, name, kicker, tagline, description, i);
      collectionIds[slug] = Number(info.lastInsertRowid);
    });

    CATALOG.forEach((item, index) => {
      const slug = slugify(item.name);
      const prices = item.values.map(([, price]) => price);
      const basePrice = Math.min(...prices);
      const info = insertProduct.run(
        slug, item.name, collectionIds[item.collection], item.notes, item.story,
        JSON.stringify(item.materials), item.care,
        basePrice, item.compare, item.rating, item.reviews, item.soldWeek, item.edition,
        item.featured ? 1 : 0, index, now,
      );
      const productId = Number(info.lastInsertRowid);

      item.values.forEach(([value, price, stock], i) => {
        insertSku.run(productId, `${slug}-${slugify(value) || i}`, item.optionName || 'Déclinaison', value, price, stock, i);
      });

      const picks = REVIEW_POOL.slice(index % 4).concat(REVIEW_POOL).slice(0, 3 + (index % 3));
      picks.forEach(([author, city, rating, title, body], i) => {
        const days = 3 + i * 6 + (index % 11);
        insertReview.run(productId, author, city, rating, title, body, new Date(Date.now() - days * 864e5).toISOString());
      });
    });

    const insertPromo = db.prepare('INSERT OR REPLACE INTO promos (code, label, kind, value, min_cents, max_uses, uses, active) VALUES (?,?,?,?,?,?,0,1)');
    insertPromo.run('MAISON20', 'MAISON20 — 20 % supplémentaires dès 150 €', 'percent', 20, 15000, 0);
    insertPromo.run('BLACK30', 'BLACK30 — 30 % dès 300 € d’achat', 'percent', 30, 30000, 400);
    insertPromo.run('PORTOFFERT', 'Livraison offerte, quel que soit le montant', 'freeship', 0, 0, 0);
    insertPromo.run('BIENVENUE10', 'BIENVENUE10 — 10 % pour une première visite', 'percent', 10, 5000, 0);

    seedDemoOrders();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

/**
 * Quelques commandes de démonstration réparties sur la semaine : le tableau de
 * bord doit montrer une activité réaliste dès le premier lancement.
 */
function seedDemoOrders() {
  const demo = [
    ['Camille Fournier', 'camille.fournier@example.fr', 'Lyon', '69003', 3, -0, 'MAISON20'],
    ['Marc Delaunay', 'marc.delaunay@example.fr', 'Paris', '75011', 2, -1, ''],
    ['Sofia Benali', 'sofia.benali@example.fr', 'Bordeaux', '33000', 5, -1, 'BLACK30'],
    ['Julien Roussel', 'julien.roussel@example.fr', 'Lille', '59000', 1, -2, 'PORTOFFERT'],
    ['Awa Diallo', 'awa.diallo@example.fr', 'Nantes', '44000', 2, -3, 'BIENVENUE10'],
    ['Thomas Lefèvre', 'thomas.lefevre@example.fr', 'Strasbourg', '67000', 4, -4, 'MAISON20'],
  ];
  const allSkus = db.prepare('SELECT s.id, s.price_cents, s.option_value, p.name, p.slug FROM skus s JOIN products p ON p.id = s.product_id WHERE s.stock > 2 ORDER BY s.id').all();

  demo.forEach(([customer, email, city, zip, itemCount, dayOffset, promoCode], i) => {
    const picks = [];
    for (let k = 0; k < itemCount; k += 1) {
      const sku = allSkus[(i * 7 + k * 11 + 3) % allSkus.length];
      if (picks.some((p) => p.id === sku.id)) continue;
      picks.push({ ...sku, qty: k === 0 ? 1 + (i % 2) : 1 });
    }
    const subtotal = picks.reduce((sum, p) => sum + p.price_cents * p.qty, 0);
    const qty = picks.reduce((sum, p) => sum + p.qty, 0);
    const bundlePercent = qty >= 5 ? 30 : qty >= 3 ? 25 : qty >= 2 ? 15 : 0;
    const bundle = Math.round((subtotal * bundlePercent) / 100);
    const afterBundle = subtotal - bundle;
    const promo = promoCode ? db.prepare('SELECT * FROM promos WHERE code = ?').get(promoCode) : null;
    let promoDiscount = 0;
    let freeShip = false;
    if (promo) {
      if (promo.kind === 'percent') promoDiscount = Math.round((afterBundle * promo.value) / 100);
      else if (promo.kind === 'freeship') freeShip = true;
    }
    const merchandise = afterBundle - promoDiscount;
    const shipping = merchandise >= 9000 || freeShip ? 0 : 690;
    const total = merchandise + shipping;
    const tax = Math.round((total * 0.2) / 1.2);
    const createdAt = new Date(Date.now() + Number(dayOffset) * 864e5 + i * 36e5).toISOString();
    const status = i === 0 ? 'en atelier' : i < 3 ? 'expédiée' : 'livrée';

    const orderInfo = db.prepare(`INSERT INTO orders
      (ref, email, first_name, last_name, address, zip, city, country, phone, gift_wrap, gift_message,
       subtotal_cents, bundle_discount_cents, promo_discount_cents, shipping_cents, tax_cents, total_cents,
       promo_code, tier_label, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      `MN-2026-${String(1000 + i)}`, email, customer.split(' ')[0], customer.split(' ')[1],
      `${10 + i} rue des Tisserands`, zip, city, 'France', '', i % 3 === 0 ? 1 : 0, '',
      subtotal, bundle, promoDiscount, shipping, tax, total, promoCode || '',
      qty >= 5 ? 'Coffret complet' : qty >= 3 ? 'Trio' : qty >= 2 ? 'Duo' : 'Pièce seule',
      status, createdAt,
    );
    const orderId = Number(orderInfo.lastInsertRowid);
    const insertLine = db.prepare('INSERT INTO order_lines (order_id, sku_id, product_slug, name, option, unit_cents, qty) VALUES (?,?,?,?,?,?,?)');
    picks.forEach((p) => insertLine.run(orderId, p.id, p.slug, p.name, p.option_value, p.price_cents, p.qty));
  });
}

seedIfEmpty();

/* ================================================================= LECTURE = */

export function collections() {
  return db.prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM collections c LEFT JOIN products p ON p.collection_id = c.id
    GROUP BY c.id ORDER BY c.position`).all();
}

export function collectionBySlug(slug) {
  return db.prepare('SELECT * FROM collections WHERE slug = ?').get(slug) || null;
}

const PRODUCT_JOIN = `
  SELECT p.*, c.name AS collection_name, c.slug AS collection_slug, c.kicker AS collection_kicker,
    (SELECT COALESCE(SUM(stock), 0) FROM skus WHERE product_id = p.id) AS total_stock
  FROM products p JOIN collections c ON c.id = p.collection_id`;

export function productCard(row) {
  const skus = skusFor(row.id);
  const bestSku = skus.reduce((best, s) => (!best || s.stock > best.stock ? s : best), null);
  return {
    ...row,
    materials: JSON.parse(row.materials || '[]'),
    skus,
    discount: Math.round((1 - row.price_cents / row.compare_cents) * 100),
    saving: row.compare_cents - row.price_cents,
    total_stock: row.total_stock,
    inStock: row.total_stock > 0,
    /** Dernière déclinaison encore disponible : sert au message d’urgence. */
    scarcest: skus.filter((s) => s.stock > 0).sort((a, b) => a.stock - b.stock)[0] || null,
    headlineSku: bestSku,
  };
}

export function skusFor(productId) {
  return db.prepare('SELECT * FROM skus WHERE product_id = ? ORDER BY position').all(productId);
}

export function listProducts({ collection = '', q = '', sort = 'selection', limit = 40, featuredOnly = false, inStockOnly = false } = {}) {
  const where = [];
  const args = [];
  if (collection) { where.push('c.slug = ?'); args.push(collection); }
  if (q) {
    const term = `%${q}%`;
    where.push('(p.name LIKE ? OR p.notes LIKE ? OR p.story LIKE ? OR c.name LIKE ?)');
    args.push(term, term, term, term);
  }
  if (featuredOnly) where.push('p.featured = 1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orders = {
    selection: 'p.featured DESC, p.sold_week DESC',
    remise: '(1.0 - CAST(p.price_cents AS REAL) / p.compare_cents) DESC',
    prix: 'p.price_cents ASC',
    'prix-desc': 'p.price_cents DESC',
    note: 'p.rating DESC, p.review_count DESC',
    nouveaute: 'p.position DESC',
  };
  const rows = db.prepare(`${PRODUCT_JOIN} ${clause} ORDER BY ${orders[sort] || orders.selection} LIMIT ?`).all(...args, limit);
  const items = rows.map(productCard);
  return inStockOnly ? items.filter((p) => p.inStock) : items;
}

export function productBySlug(slug) {
  const row = db.prepare(`${PRODUCT_JOIN} WHERE p.slug = ?`).get(slug);
  if (!row) return null;
  const product = productCard(row);
  product.reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(row.id);
  product.ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const base = stars === 5 ? 76 : stars === 4 ? 17 : stars === 3 ? 5 : stars === 2 ? 1.4 : 0.6;
    return { stars, percent: base };
  });
  product.related = db.prepare(`${PRODUCT_JOIN} WHERE p.collection_id = ? AND p.id <> ? ORDER BY p.sold_week DESC LIMIT 3`)
    .all(row.collection_id, row.id).map(productCard);
  product.crossSell = db.prepare(`${PRODUCT_JOIN} WHERE p.collection_id <> ? AND p.featured = 1 ORDER BY p.rating DESC LIMIT 3`)
    .all(row.collection_id).map(productCard);
  return product;
}

export function skuById(id) {
  return db.prepare('SELECT * FROM skus WHERE id = ?').get(Number(id)) || null;
}

/** Slug du produit auquel appartient une déclinaison (utilisé après un ajout au panier). */
export function skuProductSlug(skuId) {
  const row = db.prepare('SELECT p.slug FROM skus s JOIN products p ON p.id = s.product_id WHERE s.id = ?').get(Number(skuId));
  return row ? row.slug : null;
}

/* ================================================================== PANIER = */

export function ensureCart(token) {
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO carts (token, created_at, updated_at) VALUES (?,?,?)').run(token, now, now);
}

export function cartLines(token) {
  const rows = db.prepare(`
    SELECT cl.id AS line_id, cl.qty, cl.added_at,
           s.id AS sku_id, s.option_name, s.option_value, s.price_cents, s.stock,
           p.id AS product_id, p.slug, p.name, p.compare_cents, p.rating, p.collection_id,
           c.name AS collection_name, c.slug AS collection_slug
    FROM cart_lines cl
    JOIN skus s ON s.id = cl.sku_id
    JOIN products p ON p.id = s.product_id
    JOIN collections c ON c.id = p.collection_id
    WHERE cl.token = ? ORDER BY cl.added_at`).all(token);

  return rows.map((row) => ({
    lineId: row.line_id,
    qty: row.qty,
    skuId: row.sku_id,
    optionName: row.option_name,
    option: row.option_value,
    unit: row.price_cents,
    stock: row.stock,
    lineTotal: row.price_cents * row.qty,
    compareTotal: row.compare_cents * row.qty,
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    collectionName: row.collection_name,
    collectionSlug: row.collection_slug,
    image: `/studio/${row.slug}.svg?v=${encodeURIComponent(row.option_value)}`,
    addedAt: row.added_at,
  }));
}

export function addToCart(token, skuId, qty = 1) {
  const sku = skuById(skuId);
  if (!sku) return { ok: false, message: 'Cette déclinaison n’existe plus.' };
  if (sku.stock <= 0) return { ok: false, message: 'Cette déclinaison est épuisée.' };

  const existing = db.prepare('SELECT * FROM cart_lines WHERE token = ? AND sku_id = ?').get(token, sku.id);
  const wanted = (existing?.qty ?? 0) + qty;
  if (wanted > Math.min(10, sku.stock)) {
    return { ok: false, message: `Il ne reste que ${sku.stock} pièce(s) dans cette déclinaison.` };
  }
  if (existing) db.prepare('UPDATE cart_lines SET qty = ? WHERE id = ?').run(wanted, existing.id);
  else db.prepare('INSERT INTO cart_lines (token, sku_id, qty, added_at) VALUES (?,?,?,?)').run(token, sku.id, qty, new Date().toISOString());
  db.prepare('UPDATE carts SET updated_at = ? WHERE token = ?').run(new Date().toISOString(), token);
  return { ok: true, message: 'Pièce ajoutée à votre sélection.' };
}

export function setLineQty(token, lineId, qty) {
  const line = db.prepare(`
    SELECT cl.id, cl.sku_id, s.stock FROM cart_lines cl JOIN skus s ON s.id = cl.sku_id
    WHERE cl.id = ? AND cl.token = ?`).get(Number(lineId), token);
  if (!line) return { ok: false, message: 'Cette ligne n’existe plus.' };

  if (qty <= 0) { db.prepare('DELETE FROM cart_lines WHERE id = ?').run(line.id); return { ok: true, message: 'Pièce retirée.' }; }
  const capped = Math.min(qty, Math.min(10, line.stock));
  db.prepare('UPDATE cart_lines SET qty = ? WHERE id = ?').run(capped, line.id);
  return {
    ok: true,
    message: capped < qty ? `Quantité ajustée au stock disponible (${capped}).` : 'Quantité mise à jour.',
  };
}

export function removeLine(token, lineId) {
  db.prepare('DELETE FROM cart_lines WHERE id = ? AND token = ?').run(Number(lineId), token);
}

export function cartCount(token) {
  const { n } = db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cart_lines WHERE token = ?').get(token);
  return Number(n);
}

/* ================================================================ FAVORIS == */

export function wishlistIds(token) {
  return db.prepare('SELECT product_id FROM wishlist WHERE token = ?').all(token).map((row) => row.product_id);
}

export function toggleWish(token, productId) {
  const exists = db.prepare('SELECT 1 AS x FROM wishlist WHERE token = ? AND product_id = ?').get(token, productId);
  if (exists) {
    db.prepare('DELETE FROM wishlist WHERE token = ? AND product_id = ?').run(token, productId);
    return { ok: true, added: false, message: 'Retiré de vos favoris.' };
  }
  db.prepare('INSERT INTO wishlist (token, product_id, created_at) VALUES (?,?,?)').run(token, productId, new Date().toISOString());
  return { ok: true, added: true, message: 'Ajouté à vos favoris.' };
}

export function wishlistProducts(token) {
  return db.prepare(`${PRODUCT_JOIN} WHERE p.id IN (SELECT product_id FROM wishlist WHERE token = ?) ORDER BY p.name`).all(token).map(productCard);
}

/* ================================================================ PROMOS == */

export function promoByCode(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM promos WHERE code = ? COLLATE NOCASE').get(String(code).trim()) || null;
}

export function allPromos() {
  return db.prepare('SELECT * FROM promos ORDER BY code').all();
}

export function consumPromo(code) {
  db.prepare('UPDATE promos SET uses = uses + 1 WHERE code = ?').run(code);
}

/* =============================================================== COMMANDES = */

function newRef() {
  return `MN-2026-${crypto.randomInt(1000, 9999)}`;
}

export function createOrder({ token, customer, totals, promoCode = '', giftWrap = false, giftMessage = '' }) {
  const lines = cartLines(token);
  if (!lines.length) throw new Error('empty-cart');

  const ref = newRef();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    for (const line of lines) {
      const sku = skuById(line.skuId);
      if (!sku || sku.stock < line.qty) throw new Error(`stock:${line.name}`);
    }

    const info = db.prepare(`INSERT INTO orders
      (ref, email, first_name, last_name, address, zip, city, country, phone, gift_wrap, gift_message,
       subtotal_cents, bundle_discount_cents, promo_discount_cents, shipping_cents, tax_cents, total_cents,
       promo_code, tier_label, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      ref, String(customer.email).trim().toLowerCase(), customer.firstName, customer.lastName,
      customer.address, customer.zip, customer.city, customer.country, customer.phone || '',
      giftWrap ? 1 : 0, giftMessage, totals.subtotal, totals.bundleDiscount, totals.promoDiscount,
      totals.shipping, totals.tax, totals.total, promoCode, totals.tier.label, 'en atelier', now,
    );
    const orderId = Number(info.lastInsertRowid);

    const insertLine = db.prepare('INSERT INTO order_lines (order_id, sku_id, product_slug, name, option, unit_cents, qty) VALUES (?,?,?,?,?,?,?)');
    const decStock = db.prepare('UPDATE skus SET stock = MAX(0, stock - ?) WHERE id = ?');
    const ledger = db.prepare('INSERT INTO stock_ledger (sku_id, delta, reason, created_at) VALUES (?,?,?,?)');

    for (const line of lines) {
      insertLine.run(orderId, line.skuId, line.slug, line.name, line.option, line.unit, line.qty);
      decStock.run(line.qty, line.skuId);
      ledger.run(line.skuId, -line.qty, `commande ${ref}`, now);
    }

    if (promoCode) consumPromo(promoCode);
    db.prepare('DELETE FROM cart_lines WHERE token = ?').run(token);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return orderByRef(ref);
}

export function orderByRef(ref, email) {
  const order = db.prepare('SELECT * FROM orders WHERE ref = ? COLLATE NOCASE').get(String(ref).trim());
  if (!order) return null;
  if (email && order.email !== String(email).trim().toLowerCase()) return null;
  order.lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ?').all(order.id);
  return order;
}

export function listOrders({ status = '', q = '' } = {}) {
  const term = `%${q}%`;
  return db.prepare(`
    SELECT o.*, (SELECT COALESCE(SUM(qty),0) FROM order_lines WHERE order_id = o.id) AS items
    FROM orders o
    WHERE (? = '' OR o.status = ?) AND (o.email LIKE ? OR o.ref LIKE ? OR o.last_name LIKE ?)
    ORDER BY o.id DESC LIMIT 120`).all(status, status, term, term, term);
}

export function setOrderStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) return false;
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(id));
  return info.changes > 0;
}

export function dashboard() {
  const revenue = db.prepare("SELECT COALESCE(SUM(total_cents),0) AS v FROM orders WHERE status <> 'annulée'").get().v;
  const orders = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const today = db.prepare("SELECT COALESCE(SUM(total_cents),0) AS v FROM orders WHERE date(created_at,'localtime') = date('now','localtime')").get().v;
  const items = db.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM order_lines').get().n;
  const giftWraps = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE gift_wrap = 1').get().n;
  const newsletterCount = db.prepare('SELECT COUNT(*) AS n FROM newsletter').get().n;

  return {
    revenue, orders, today, items, giftWraps, newsletterCount,
    averageBasket: orders ? Math.round(revenue / orders) : 0,
    byTier: db.prepare(`
      SELECT tier_label, COUNT(*) AS orders, SUM(total_cents) AS revenue
      FROM orders GROUP BY tier_label ORDER BY revenue DESC`).all(),
    byCollection: db.prepare(`
      SELECT c.name AS name, SUM(ol.qty) AS qty, SUM(ol.qty * ol.unit_cents) AS revenue
      FROM order_lines ol
      JOIN products p ON p.slug = ol.product_slug
      JOIN collections c ON c.id = p.collection_id
      GROUP BY c.id ORDER BY revenue DESC`).all(),
    bestsellers: db.prepare(`
      SELECT ol.name, ol.product_slug, SUM(ol.qty) AS qty, SUM(ol.qty * ol.unit_cents) AS revenue
      FROM order_lines ol GROUP BY ol.product_slug ORDER BY revenue DESC LIMIT 8`).all(),
    timeline: db.prepare(`
      SELECT date(created_at,'localtime') AS day, COUNT(*) AS orders, SUM(total_cents) AS revenue
      FROM orders GROUP BY day ORDER BY day DESC LIMIT 14`).all().reverse(),
    lowStock: db.prepare(`
      SELECT s.id, s.option_value, s.stock, p.name, p.slug
      FROM skus s JOIN products p ON p.id = s.product_id
      WHERE s.stock <= 12 ORDER BY s.stock ASC LIMIT 10`).all(),
    promoUse: db.prepare('SELECT code, label, uses, max_uses FROM promos ORDER BY uses DESC').all(),
    ledger: db.prepare(`
      SELECT l.delta, l.reason, l.created_at, s.option_value, p.name, p.slug
      FROM stock_ledger l JOIN skus s ON s.id = l.sku_id JOIN products p ON p.id = s.product_id
      ORDER BY l.id DESC LIMIT 12`).all(),
  };
}

export function subscribeNewsletter(email, source = 'site') {
  const clean = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean)) return { ok: false, message: 'Adresse e-mail invalide.' };
  db.prepare('INSERT OR IGNORE INTO newsletter (email, source, created_at) VALUES (?,?,?)').run(clean, source, new Date().toISOString());
  return { ok: true, message: 'Bienvenue dans la Maison — votre code de bienvenue vous attend.' };
}

export function newsletterList() {
  return db.prepare('SELECT * FROM newsletter ORDER BY created_at DESC LIMIT 200').all();
}

export function upsertPromo({ code, label, kind, value, min, maxUses }) {
  db.prepare(`INSERT INTO promos (code, label, kind, value, min_cents, max_uses, uses, active)
    VALUES (?,?,?,?,?,?, COALESCE((SELECT uses FROM promos WHERE code = ?), 0), 1)`)
    .run(code, label, kind, value, min, maxUses, code);
}

export function deletePromo(code) {
  db.prepare('DELETE FROM promos WHERE code = ?').run(String(code).toUpperCase());
}

export function updateSkuStock(skuId, stock) {
  const sku = skuById(skuId);
  if (!sku) return false;
  const delta = stock - sku.stock;
  db.prepare('UPDATE skus SET stock = ? WHERE id = ?').run(stock, sku.id);
  db.prepare('INSERT INTO stock_ledger (sku_id, delta, reason, created_at) VALUES (?,?,?,?)')
    .run(sku.id, delta, 'ajustement back-office', new Date().toISOString());
  return true;
}

export function setProductPrice(productId, priceCents) {
  const info = db.prepare('UPDATE products SET price_cents = ? WHERE id = ?').run(Math.max(0, Math.round(priceCents)), Number(productId));
  return info.changes > 0;
}

export function adminProducts(q = '') {
  const term = `%${q}%`;
  return db.prepare(`${PRODUCT_JOIN} WHERE p.name LIKE ? OR c.name LIKE ? ORDER BY p.position LIMIT 120`).all(term, term)
    .map((row) => ({ ...productCard(row), collectionName: row.collection_name }));
}
