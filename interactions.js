/* ============================================ interactions.js — Maison Noire
   Amélioration progressive uniquement. Tout le site fonctionne sans ce fichier :
   ici on ne fait qu’enrichir (compte à rebours vivant, tiroir animé, sélection
   de déclinaison instantanée, favoris sans rechargement).
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ------------------------------------------------ 1. Compte à rebours */
  const targets = $$('[data-countdown-until]');
  if (targets.length) {
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      for (const node of targets) {
        const left = Math.max(0, new Date(node.dataset.countdownUntil).getTime() - Date.now());
        const parts = {
          j: Math.floor(left / 864e5),
          h: Math.floor((left % 864e5) / 36e5),
          m: Math.floor((left % 36e5) / 6e4),
          s: Math.floor((left % 6e4) / 1000),
        };
        for (const [unit, value] of Object.entries(parts)) {
          const cell = $(`[data-cd="${unit}"]`, node);
          if (cell) cell.textContent = pad(value);
        }
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------------------------------ 2. Tiroir mobile */
  const drawer = $('#drawer');
  const scrim = $('#scrim');
  const setDrawer = (open) => {
    if (!drawer) return;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    if (scrim) scrim.hidden = !open;
  };
  $$('[data-drawer-open]').forEach((btn) => btn.addEventListener('click', () => setDrawer(true)));
  $$('[data-drawer-close]').forEach((btn) => btn.addEventListener('click', () => setDrawer(false)));
  scrim?.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setDrawer(false);
  });

  /* ------------------------------------------------------------ 3. Bandeau */
  $$('[data-dismiss]').forEach((btn) => btn.addEventListener('click', () => {
    const notice = btn.closest('.notice');
    if (notice) notice.remove();
  }));

  /* ----------------------------------------------------------- 4. Steppers */
  $$('[data-stepper]').forEach((stepper) => {
    const input = $('input[name="qty"]', stepper);
    if (!input) return;
    const apply = (delta) => {
      const min = Number(input.min || 1);
      const max = Number(input.max || 10);
      const next = Math.min(max, Math.max(min, (Number(input.value) || min) + delta));
      if (next === Number(input.value)) return;
      input.value = next;
      // Les formulaires du panier se soumettent d’eux-mêmes : pas de bouton à chercher.
      if (stepper.hasAttribute('data-autosubmit')) input.form?.submit();
    };
    $$('[data-step]', stepper).forEach((btn) => btn.addEventListener('click', () => apply(Number(btn.dataset.step))));
  });

  /* ------------------------------------------------- 5. Déclinaison produit */
  const mainImage = $('#pdp-image');
  const stockHint = $('#stock-hint');
  if (mainImage) {
    const slug = mainImage.getAttribute('src').split('/').pop().split('.svg')[0];
    const select = (value, { updateRadios = true } = {}) => {
      mainImage.src = `/studio/${slug}.svg?v=${encodeURIComponent(value)}`;
      $$('[data-variant-thumb]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.value === value));
      if (updateRadios) {
        $$('.option input[type="radio"]').forEach((radio) => {
          const label = radio.closest('.option');
          const matches = label && label.textContent.includes(value);
          if (matches && !radio.disabled) radio.checked = true;
        });
      }
      const thumb = $$('[data-variant-thumb]').find((btn) => btn.dataset.value === value);
      if (thumb && stockHint) stockHint.textContent = `${thumb.dataset.stock} en stock`;
    };

    $$('[data-variant-thumb]').forEach((btn) => btn.addEventListener('click', () => select(btn.dataset.value)));
    $$('.option').forEach((label) => {
      const radio = $('input[type="radio"]', label);
      if (!radio) return;
      radio.addEventListener('change', () => {
        const value = label.querySelector('b')?.textContent?.trim();
        if (value) select(value, { updateRadios: false });
      });
    });
  }

  /* ------------------------------------------------------------ 6. Favoris */
  $$('[data-wish]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const body = new URLSearchParams({ productId: btn.dataset.product });
      const res = await fetch('/favoris/basculer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });
      if (!res.ok) throw new Error('network');
      const payload = await res.json();
      const added = payload.added;
      btn.classList.toggle('is-on', added);
      btn.textContent = added ? '♥ Dans vos favoris' : '♡ Ajouter aux favoris';
    } catch {
      // Sans réponse exploitable, on laisse le formulaire POST prendre le relais.
      const form = document.createElement('form');
      form.method = 'post';
      form.action = '/favoris/basculer';
      form.innerHTML = `<input type="hidden" name="productId" value="${btn.dataset.product}">`;
      document.body.append(form);
      form.submit();
    } finally {
      btn.disabled = false;
    }
  }));

  /* ------------------------------------------------ 7. Formulaire commande */
  const checkout = $('form[action="/commande"]');
  if (checkout) {
    checkout.addEventListener('submit', (event) => {
      const button = $('button[type="submit"]', checkout);
      if (button && checkout.checkValidity()) {
        button.disabled = true;
        button.textContent = 'Paiement en cours…';
      } else if (!checkout.checkValidity()) {
        // Le navigateur affiche déjà le champ fautif ; on n’envoie rien.
        event.preventDefault();
      }
    });
  }
})();
