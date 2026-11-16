// The HUD: one owner for every DOM element in index.html, so game logic never
// touches the document directly. Buy menu items are rendered from the weapon
// definitions; everything else is a small setter. Visibility follows the
// page's own convention: the `hidden` attribute for panels, `.show` for the
// banner, `.on` for the hitmarker, `.hurt` for the damage vignette.
import { GRENADE_PRICE, GRENADE_MAX } from './weapons.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const banner = $('banner');
  const el = {
    health: $('health'),
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenades: $('grenades'),
    money: $('money'),
    roundLabel: $('round-label'),
    scoreYou: document.querySelector('#score .you'),
    scoreFoe: document.querySelector('#score .foe'),
    timer: $('timer'),
    bombStatus: $('bomb-status'),
    killfeed: $('killfeed'),
    banner,
    bannerTitle: banner.querySelector('h2'),
    bannerSub: banner.querySelector('p'),
    hint: $('hint'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    buyMenu: $('buy-menu'),
    buyRound: $('buy-round'),
    shop: $('shop'),
    buyCash: $('buy-cash'),
    buyClose: $('buy-close'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlaySub: $('overlay-copy'),
    play: $('play'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('vignette'),
  };
  let bannerTimer = null;
  let hitTimer = null;

  return {
    setHealth(hp) {
      const shown = Math.max(0, Math.ceil(hp));
      el.healthNum.innerHTML = `${shown} <span>HP</span>`;
      el.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      el.health.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name, grenades) {
      el.ammoMag.textContent = mag;
      el.ammoReserve.textContent = `/ ${reserve}`;
      el.ammo.classList.toggle('empty', mag === 0);
      el.weaponName.textContent = name.toUpperCase();
      el.grenades.textContent = `FRAG × ${grenades}  [G]`;
    },
    setMoney(n) {
      el.money.textContent = `$${n.toLocaleString('en-US')}`;
    },
    setRound(n, us, them) {
      el.roundLabel.textContent = `ROUND ${n}`;
      el.scoreYou.textContent = us;
      el.scoreFoe.textContent = them;
    },
    setTimer(text, urgent) {
      el.timer.textContent = text;
      el.timer.classList.toggle('urgent', Boolean(urgent));
    },
    setBomb(text, cls) {
      el.bombStatus.textContent = text;
      el.bombStatus.className = cls || '';
    },
    killfeed(msg, cls) {
      const row = document.createElement('div');
      row.className = cls || '';
      row.textContent = msg;
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      el.banner.classList.remove('show');
    },
    hint(text) {
      el.hint.textContent = text || '';
      el.hint.hidden = !text;
    },
    plant(progress) {
      el.plantBar.hidden = progress === null;
      if (progress !== null) el.plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    crosshairGap(px) {
      el.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitmarker() {
      el.hitmarker.classList.add('on');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on'), 140);
    },
    damageFlash() {
      el.vignette.classList.add('hurt');
      setTimeout(() => el.vignette.classList.remove('hurt'), 220);
    },
    showBuy(defs, owned, current, cash, grenades, round, onBuy) {
      el.shop.innerHTML = '';
      const items = [];
      let key = 1;
      for (const [id, def] of Object.entries(defs)) {
        items.push({ id, key: key.toString(), name: def.name, price: def.price, blurb: def.blurb, owned: owned.has(id), equipped: current === id });
        key += 1;
      }
      items.push({ id: 'grenade', key: key.toString(), name: 'Frag Grenade', price: GRENADE_PRICE, blurb: `Blast damage in a radius. Carry up to ${GRENADE_MAX}. Press G to throw.`, owned: grenades > 0, equipped: false, count: grenades });
      for (const item of items) {
        const row = document.createElement('div');
        const afford = cash >= item.price;
        row.className = `shop-item${item.equipped ? ' equipped' : ''}${!afford && !item.owned ? ' cant' : ''}`;
        const keyEl = document.createElement('span');
        keyEl.className = 'key';
        keyEl.textContent = item.key;
        const nmEl = document.createElement('span');
        nmEl.className = 'nm';
        nmEl.textContent = item.count ? `${item.name} ×${item.count}` : item.name;
        const dsEl = document.createElement('span');
        dsEl.className = 'ds';
        dsEl.textContent = item.blurb;
        const prEl = document.createElement('span');
        prEl.className = 'pr';
        prEl.textContent = item.owned && item.id !== 'grenade' ? 'OWNED' : `$${item.price.toLocaleString('en-US')}`;
        row.append(keyEl, nmEl, dsEl, prEl);
        row.addEventListener('click', () => onBuy(item.id));
        el.shop.appendChild(row);
      }
      el.buyCash.textContent = `$${cash.toLocaleString('en-US')}`;
      el.buyRound.textContent = round;
      el.buyMenu.hidden = false;
    },
    hideBuy() {
      el.buyMenu.hidden = true;
    },
    onBuyClose(handler) {
      el.buyClose.addEventListener('click', handler);
    },
    overlay(title, sub, buttonText, onPlay) {
      el.overlayTitle.textContent = title;
      el.overlaySub.textContent = sub;
      el.play.textContent = buttonText;
      el.overlay.hidden = false;
      el.play.onclick = onPlay;
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    setPlayEnabled(enabled) {
      el.play.disabled = !enabled;
    },
  };
}
