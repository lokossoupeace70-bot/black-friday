/**
 * pricing.js — règles commerciales de la campagne.
 *
 * Deux mécaniques de vente, toutes deux calculées côté serveur pour que le
 * total affiché soit toujours le total facturé :
 *   1. remise volumique automatique (plus on ajoute, plus la remise monte) ;
 *   2. code promo cumulable, appliqué après la remise volumique.
 */
export const VAT_RATE = 0.20;
export const SHIPPING_CENTS = 690;
export const FREE_SHIPPING_CENTS = 9000;
export const GIFT_WRAP_CENTS = 490;
export const MAX_DISCOUNT_PERCENT = 40;

/** Paliers automatiques — le cœur de l’argumentaire de la campagne. */
export const TIERS = [
  { id: 'solo', minQty: 1, percent: 0, label: 'Pièce seule', teaser: 'Ajoutez 1 pièce pour débloquer −15 %' },
  { id: 'duo', minQty: 2, percent: 15, label: 'Duo', teaser: 'Ajoutez 1 pièce pour passer à −25 %' },
  { id: 'trio', minQty: 3, percent: 25, label: 'Trio', teaser: 'Ajoutez 2 pièces pour atteindre −30 %' },
  { id: 'coffret', minQty: 5, percent: 30, label: 'Coffret complet', teaser: 'Palier maximal atteint — profitez-en' },
];

export const EVENT = {
  name: 'BLACK FRIDAY',
  claim: 'Trois jours pour entrer dans la Maison',
  editorial: 'Une sélection resserrée, fabriquée en petites séries. Chaque pièce est numérotée et garantie à vie.',
  endsAt: new Date('2026-11-30T23:59:59+01:00'),
  opensAt: new Date('2026-11-27T08:00:00+01:00'),
};

export function tierFor(qty) {
  let current = TIERS[0];
  for (const tier of TIERS) if (qty >= tier.minQty) current = tier;
  return current;
}

export function nextTierFor(qty) {
  return TIERS.find((tier) => tier.minQty > qty) || null;
}

/**
 * Calcule l’intégralité du panier : remise volumique, code promo, port, TVA.
 * @param {{ lines: Array<{unit:number, qty:number}>, promo?: object|null, giftWrap?: boolean }} input
 */
export function totals({ lines, promo = null, giftWrap = false }) {
  const qty = lines.reduce((n, line) => n + line.qty, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);

  const tier = tierFor(qty);
  let bundleDiscount = Math.round((subtotal * tier.percent) / 100);

  // Plafond de sécurité : la remise volumique ne peut pas dépasser MAX_DISCOUNT_PERCENT.
  bundleDiscount = Math.min(bundleDiscount, Math.round((subtotal * MAX_DISCOUNT_PERCENT) / 100));

  const afterBundle = subtotal - bundleDiscount;

  let promoDiscount = 0;
  let freeShipping = false;
  if (promo) {
    if (promo.kind === 'percent') promoDiscount = Math.round((afterBundle * promo.value) / 100);
    else if (promo.kind === 'amount') promoDiscount = Math.min(promo.value, afterBundle);
    else if (promo.kind === 'freeship') freeShipping = true;
  }
  promoDiscount = Math.min(promoDiscount, afterBundle);

  const merchandise = afterBundle - promoDiscount;
  const shipping = qty === 0 || merchandise >= FREE_SHIPPING_CENTS || freeShipping ? 0 : SHIPPING_CENTS;
  const wrap = giftWrap && qty > 0 ? GIFT_WRAP_CENTS : 0;
  const total = merchandise + shipping + wrap;
  const tax = Math.round((total * VAT_RATE) / (1 + VAT_RATE));

  const next = nextTierFor(qty);
  const currentFloor = tier.percent;
  const nextFloor = next ? next.percent : tier.percent;

  return {
    qty,
    subtotal,
    tier,
    nextTier: next,
    bundleDiscount,
    promoDiscount,
    discount: bundleDiscount + promoDiscount,
    merchandise,
    shipping,
    giftWrap: wrap,
    total,
    tax,
    freeShipping,
    shippingRemaining: Math.max(0, FREE_SHIPPING_CENTS - merchandise),
    /** Progression vers le palier suivant, exprimée en pourcentage. */
    tierProgress: qty === 0
      ? 0
      : Math.round(
        ((qty - tier.minQty + 1) / Math.max(1, (next ? next.minQty : tier.minQty + 1) - tier.minQty + 1)) * 100,
      ),
    potentialSaving: next ? Math.round((subtotal * nextFloor) / 100) - bundleDiscount : 0,
  };
}

/** Valide un code promo contre un panier, en levant une erreur métier explicite. */
export function validatePromo(promo, subtotal) {
  if (!promo) return { ok: false, message: 'Ce code n’existe pas ou n’est plus actif.' };
  if (!promo.active) return { ok: false, message: 'Ce code a été désactivé par la Maison.' };
  if (promo.max_uses > 0 && promo.uses >= promo.max_uses) {
    return { ok: false, message: 'Ce code a atteint sa limite d’utilisation.' };
  }
  if (subtotal < promo.min_cents) {
    return { ok: false, message: `Ce code s’active à partir de ${(promo.min_cents / 100).toFixed(2).replace('.', ',')} € de panier.` };
  }
  return { ok: true, message: promo.label };
}

export const fmtEuro = (cents) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
}).format((cents || 0) / 100);

/** Compose une fourchette de livraison crédible : 2 jours ouvrés minimum. */
export function deliveryWindow(from = new Date()) {
  const addWorkingDays = (date, days) => {
    const out = new Date(date);
    let added = 0;
    while (added < days) {
      out.setDate(out.getDate() + 1);
      if (out.getDay() !== 0 && out.getDay() !== 6) added += 1;
    }
    return out;
  };
  const start = addWorkingDays(from, 2);
  const end = addWorkingDays(from, 4);
  const format = (date) => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return { start, end, label: `Livraison estimée entre ${format(start)} et ${format(end)}` };
}
