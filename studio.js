/**
 * studio.js — direction artistique générée (SVG vectoriel, aucun asset externe).
 *
 * Registre opposé à la boutique tech : lumière douce de studio, fond chaud,
 * piédestal, ombre portée et silhouette d’objet. Les teintes dépendent de la
 * collection, ce qui donne une vraie identité visuelle par univers.
 */
import { hashInt } from './http.js';

const PALETTES = {
  'parfums-bougies': { bg: ['#2a1f19', '#150e0a'], spot: '#e8c9a0', object: ['#f4e3cd', '#c9a074', '#8a6440'] },
  'textile-plaid': { bg: ['#232322', '#121211'], spot: '#d8d2c6', object: ['#efe9dd', '#b7ad9c', '#7d7466'] },
  luminaires: { bg: ['#2b2519', '#161208'], spot: '#ffd79a', object: ['#fff3d6', '#e8b866', '#a67c33'] },
  'art-de-la-table': { bg: ['#1f2426', '#0e1213'], spot: '#cfe0e4', object: ['#f1f6f7', '#b3c7cc', '#6f868c'] },
  maroquinerie: { bg: ['#2c1c1c', '#160b0b'], spot: '#e9a98d', object: ['#f6d3c1', '#c47a5c', '#7f4230'] },
  horlogerie: { bg: ['#1c1e24', '#0c0d11'], spot: '#c9cfe0', object: ['#eef1f7', '#a9b2c6', '#666e82'] },
};

const FALLBACK = { bg: ['#231f20', '#121011'], spot: '#ddc9ae', object: ['#f2e6d8', '#bfa88c', '#806c56'] };

/* Chaque univers possède sa silhouette d’objet, dessinée en trois plans. */
const OBJECTS = {
  'parfums-bougies': (f, m, d) => `
    <rect x="188" y="238" width="144" height="180" rx="22" fill="${m}"/>
    <rect x="188" y="238" width="144" height="46" rx="20" fill="${d}" opacity=".55"/>
    <ellipse cx="260" cy="238" rx="74" ry="17" fill="${m}"/>
    <ellipse cx="260" cy="236" rx="60" ry="12" fill="${d}" opacity=".65"/>
    <path d="M260 224 v-34" stroke="${f}" stroke-width="5" stroke-linecap="round"/>
    <path d="M260 182 q14 -12 0 -24 q-14 12 0 24" fill="${f}" opacity=".85"/>
    <rect x="214" y="300" width="88" height="58" rx="6" fill="${d}" opacity=".28"/>`,
  'textile-plaid': (f, m, d) => `
    <path d="M150 300 q110 -58 220 0 v96 q-110 58 -220 0 z" fill="${m}"/>
    <path d="M150 300 q110 -58 220 0 v22 q-110 58 -220 0 z" fill="${f}" opacity=".55"/>
    <path d="M150 344 q110 58 220 0" fill="none" stroke="${d}" stroke-width="4" opacity=".5"/>
    <path d="M196 268 q64 -26 128 0" fill="none" stroke="${f}" stroke-width="3" opacity=".45"/>
    <path d="M150 396 q110 58 220 0" fill="none" stroke="${d}" stroke-width="6" opacity=".35"/>`,
  luminaires: (f, m, d) => `
    <path d="M186 262 h148 l-26 -82 h-96 z" fill="${m}"/>
    <path d="M208 180 h104" stroke="${f}" stroke-width="7" stroke-linecap="round"/>
    <path d="M260 180 v-32" stroke="${d}" stroke-width="6" stroke-linecap="round"/>
    <ellipse cx="260" cy="262" rx="74" ry="15" fill="${f}" opacity=".5"/>
    <path d="M260 262 v106" stroke="${d}" stroke-width="9" stroke-linecap="round"/>
    <ellipse cx="260" cy="376" rx="62" ry="14" fill="${m}"/>
    <path d="M186 262 l-30 96 M334 262 l30 96" stroke="${f}" stroke-width="3" opacity=".28"/>`,
  'art-de-la-table': (f, m, d) => `
    <path d="M204 216 q56 -26 112 0 v58 q-16 34 -56 34 t-56 -34 z" fill="${m}"/>
    <path d="M204 250 q56 30 112 0" fill="none" stroke="${f}" stroke-width="6" opacity=".6"/>
    <path d="M260 308 v84" stroke="${m}" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="260" cy="398" rx="66" ry="14" fill="${m}"/>
    <path d="M310 244 q42 6 38 40 q-4 28 -34 30" fill="none" stroke="${m}" stroke-width="11" stroke-linecap="round"/>
    <path d="M212 232 q48 -18 96 0" fill="none" stroke="${d}" stroke-width="3" opacity=".5"/>`,
  maroquinerie: (f, m, d) => `
    <rect x="164" y="268" width="192" height="140" rx="26" fill="${m}"/>
    <path d="M220 268 v-16 a40 40 0 0 1 80 0 v16" fill="none" stroke="${d}" stroke-width="11" stroke-linecap="round"/>
    <rect x="164" y="268" width="192" height="34" rx="18" fill="${f}" opacity=".38"/>
    <rect x="240" y="322" width="40" height="26" rx="6" fill="${d}" opacity=".7"/>
    <path d="M186 293 h148" stroke="${d}" stroke-width="2" opacity=".45"/>`,
  horlogerie: (f, m, d) => `
    <circle cx="260" cy="308" r="86" fill="${m}"/>
    <circle cx="260" cy="308" r="70" fill="${f}" opacity=".28"/>
    <circle cx="260" cy="308" r="70" fill="none" stroke="${d}" stroke-width="3"/>
    <path d="M260 308 v-42 M260 308 l34 22" stroke="${d}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="260" cy="308" r="6" fill="${d}"/>
    <path d="M226 232 q34 -30 68 0" fill="none" stroke="${m}" stroke-width="14" stroke-linecap="round"/>
    <path d="M226 384 q34 30 68 0" fill="none" stroke="${m}" stroke-width="14" stroke-linecap="round"/>`,
};

/**
 * @param {{ slug:string, name:string, collectionSlug:string, option?:string }} product
 * @returns {string} document SVG autonome
 */
export function studioArt({ slug, name = '', collectionSlug = '', option = '' }) {
  const seed = hashInt(slug + '|' + option);
  const palette = PALETTES[collectionSlug] || FALLBACK;
  const [bg1, bg2] = palette.bg;
  const [f, m, d] = palette.object;
  const shape = OBJECTS[collectionSlug] || OBJECTS['parfums-bougies'];
  const uid = `s${seed.toString(16).slice(0, 6)}`;
  const tilt = ((seed >>> 5) % 5) - 2;
  const spotX = 180 + ((seed >>> 11) % 160);
  const spotY = 120 + ((seed >>> 17) % 90);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 620" width="520" height="620" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="${uid}-bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="${uid}-spot" cx="${(spotX / 520 * 100).toFixed(1)}%" cy="${(spotY / 620 * 100).toFixed(1)}%" r="62%">
      <stop offset="0" stop-color="${palette.spot}" stop-opacity=".34"/>
      <stop offset="0.55" stop-color="${palette.spot}" stop-opacity=".10"/>
      <stop offset="1" stop-color="${palette.spot}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${uid}-obj" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${f}"/><stop offset="0.45" stop-color="${m}"/><stop offset="1" stop-color="${d}"/>
    </linearGradient>
    <radialGradient id="${uid}-vig" cx="50%" cy="48%" r="72%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".55"/>
    </radialGradient>
    <pattern id="${uid}-linen" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.7" fill="${palette.spot}" fill-opacity=".07"/>
    </pattern>
  </defs>

  <rect width="520" height="620" fill="url(#${uid}-bg)"/>
  <rect width="520" height="620" fill="url(#${uid}-linen)"/>
  <rect width="520" height="620" fill="url(#${uid}-spot)"/>

  <!-- piédestal de studio -->
  <ellipse cx="260" cy="418" rx="176" ry="26" fill="#000" opacity=".38"/>
  <ellipse cx="260" cy="414" rx="120" ry="15" fill="${palette.spot}" opacity=".10"/>

  <g transform="rotate(${tilt} 260 320)" opacity=".98">
    ${shape(`url(#${uid}-obj)`, `url(#${uid}-obj)`, d)}
  </g>

  <rect width="520" height="620" fill="url(#${uid}-vig)"/>
</svg>`;
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}
