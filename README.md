# MAISON NOIRE ❦ — boutique Black Friday (maison & art de vivre)

Boutique e-commerce complète pour la campagne **Black Friday**, univers décoration
et art de vivre. **Rendu côté serveur**, formulaires classiques, persistance SQLite.
**Zéro dépendance npm**.

```bash
cd maison-noire
npm start                 # http://127.0.0.1:4200
npm test                  # 94 vérifications de bout en bout
npm run reset             # repartir d'un catalogue neuf (supprime data/)
```

- Boutique : http://127.0.0.1:4200
- Back-office : http://127.0.0.1:4200/admin — mot de passe `maisonnoire2026`
  (modifiable via la variable d'environnement `ADMIN_PASSWORD`)

---

## 1. La mécanique de vente : les paliers

L’argument central de la campagne n’est pas un code promo mais une **remise volumique
automatique** : plus le panier se remplit, plus la remise grimpe.

| Palier | Seuil | Remise |
| --- | --- | --- |
| Pièce seule | 1 pièce | — |
| Duo | 2 pièces | −15 % |
| Trio | 3 pièces | −25 % |
| Coffret complet | 5 pièces | −30 % (plafond global : 40 %) |

Cette mécanique est expliquée en page d’accueil, affichée en jauge dans le panier,
rappelée sur chaque fiche produit (« ajoutez 1 pièce : votre remise passe à −15 %,
soit 7,35 € économisés ») et **recalculée côté serveur** à chaque affichage.

Un code de la Maison (`MAISON20`, `BLACK30`, `PORTOFFERT`, `BIENVENUE10`) vient
s’ajouter par-dessus le palier, avec son propre seuil minimum — impossible de cumuler
des remises incohérentes, le total affiché est toujours le total facturé.

## 2. Parcours d’achat

Accueil → boutique ou collection → fiche produit (déclinaisons et stock réel) →
panier (paliers, code, port) → livraison & règlement (emballage cadeau, message) →
confirmation avec suivi → suivi de commande par référence + e-mail.

Trois leviers de conversion au-delà des paliers :

- **Emballage cadeau** (offert dès 3 pièces) avec carte manuscrite, à cocher au checkout ;
- **Rareté réelle** : le stock est tenu par déclinaison, pas par produit — « il ne reste
  que 7 pièces en 180 g » est une donnée de base, pas un argument marketing ;
- **Fenêtre de livraison datée**, calculée en jours ouvrés à l’affichage.

## 3. Architecture

```
server/
  http.js        primitives HTTP : réponses HTML, cookies, formulaires, routeur, statique
  session.js     identité anonyme signée (panier et favoris rattachés au jeton)
  pricing.js     règles commerciales : paliers, port, TVA, codes, fenêtre de livraison
  studio.js      direction artistique générée (SVG, lumière de studio, une palette par univers)
  store.js       schéma SQLite, catalogue, commandes, stocks, statistiques
  routes.js      table de routes (+ redirection POST → GET)
  views/
    ui.js        squelette de page et fragments réutilisables
    pages.js     pages complètes
    admin.js     back-office
  index.js       point d’entrée
public/
  theme.css      identité ivoire / encre / laiton
  admin.css      densité « outil » pour le back-office
  interactions.js amélioration progressive
tools/
  smoke-test.js  parcours complet + contrôle de rendu
```

Choix techniques :

- **Rendu serveur** : chaque page arrive complète. Bon pour le SEO, bon pour le
  premier affichage sur mobile en 4G — et le site fonctionne **entièrement sans
  JavaScript**.
- **POST → redirection → GET** : rafraîchir la page après une commande ne rejoue
  jamais l’achat. Les messages d’état voyagent dans l’URL, pas dans un cookie.
- **Amélioration progressive** : `interactions.js` ne fait qu’enrichir (compte à
  rebours vivant, tiroir animé, favoris sans rechargement, changement de
  déclinaison instantané). Sans lui, tout fonctionne par formulaires.
- **Vérification d’origine** sur toute mutation POST : une requête venue d’un autre
  domaine est refusée (403).
- **Visuels générés** : chaque pièce reçoit une composition de studio (fond chaud,
  halo, piédestal, ombre portée) avec une palette propre à sa collection.
- **Stock tracé** : chaque vente et chaque ajustement écrit dans `stock_ledger`,
  consultable dans le back-office.

## 4. Back-office

`/admin` : tableau de bord (chiffre d’affaires, panier moyen, paliers déclenchés,
codes utilisés, courbe par jour, répartition par collection, alertes de stock,
journal des mouvements), commandes (filtre + statut), **stocks par déclinaison**,
prix, codes de la Maison, base clients.

## 5. Tests

`npm test` démarre un serveur réel et déroule le parcours complet : 94 assertions.
Au-delà du fonctionnel, le test vérifie que **les pages ne laissent fuir aucune
valeur non résolue** (`undefined`, `NaN`, template non remplacé, prix à 0,00 €) —
c’est ce contrôle qui a fait remonter le plus de bugs pendant le développement.

## 6. Ce qui est simulé

Paiement (aucune transaction réelle), e-mails transactionnels et transporteur.
Catalogue, stocks par déclinaison, paniers, favoris, commandes et statistiques
sont réellement persistés en base.
