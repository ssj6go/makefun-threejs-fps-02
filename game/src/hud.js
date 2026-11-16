// The HUD: one owner for every DOM element in index.html, so game logic never
// touches the document directly. Buy menu items are rendered from the weapon
// definitions; everything else is a small setter.
import { GRENADE_PRICE, GRENADE_MAX } from './weapons.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    money: $('money'),
    roundNum: $('round-num'),
    scoreUs: $('score-us'),
    scoreThem: $('score-them'),
    timer: $('timer'),
    bombStatus: $('bomb-status'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    hint: $('hint'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    buyMenu: $('buy-menu'),
    shop: $('shop'),
    buyCash: $('buy-cash'),
    buyClose: $('buy-close'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlaySub: $('overlay-sub'),
    play: $('play'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('vignette'),
  };
  let bannerTimer = null;
  let hitTimer = null;

  return {
    setHealth(hp) {
      el.healthNum.textContent = Math.max(0, Math.ceil(hp));
      el.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      el.healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name, grenades) {
      el.ammo.textContent = `${mag} / ${reserve}`;
      el.weaponName.textContent = grenades > 0 ? `${name}  ·  Frag ×${grenades}` : name;
    },
    setMoney(n) {
      el.money.textContent = `$${n.toLocaleString('en-US')}`;
    },
    setRound(n, us, them) {
      el.roundNum.textContent = `ROUND ${n}`;
      el.scoreUs.textContent = us;
      el.scoreThem.textContent = them;
    },
    setTimer(text, urgent) {
      el.timer.textContent = text;
      el.timer.classList.toggle('urgent', Boolean(urgent));
    },
    setBomb(text, cls) {
      el.bombStatus.textContent = text;
      el.bombStatus.className = `bomb-status ${cls || ''}`;
    },
    killfeed(msg, cls) {
      const row = document.createElement('div');
      row.className = `feed-row ${cls || ''}`;
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
    hint(text) {
      el.hint.textContent = text || '';
    },
    plant(progress) {
      if (progress === null) {
        el.plantBar.classList.remove('show');
        return;
      }
      el.plantBar.classList.add('show');
      el.plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    crosshairGap(px) {
      el.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitmarker(kill) {
      el.hitmarker.classList.add('show');
      el.hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('show', 'kill'), 140);
    },
    damageFlash() {
      el.vignette.classList.add('hurt');
      setTimeout(() => el.vignette.classList.remove('hurt'), 220);
    },
    showBuy(defs, owned, current, cash, grenades, onBuy) {
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
        row.innerHTML = `<span class="shop-key">${item.key}</span><span class="shop-name">${item.name}${item.count ? ` ×${item.count}` : ''}</span><span class="shop-blurb">${item.blurb}</span><span class="shop-price">$${item.price.toLocaleString('en-US')}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        el.shop.appendChild(row);
      }
      el.buyCash.textContent = `$${cash.toLocaleString('en-US')}`;
      el.buyMenu.classList.add('show');
    },
    hideBuy() {
      el.buyMenu.classList.remove('show');
    },
    onBuyClose(handler) {
      el.buyClose.addEventListener('click', handler);
    },
    overlay(title, sub, buttonText, onPlay) {
      el.overlayTitle.textContent = title;
      el.overlaySub.textContent = sub;
      el.play.textContent = buttonText;
      el.overlay.classList.add('show');
      el.play.onclick = onPlay;
    },
    hideOverlay() {
      el.overlay.classList.remove('show');
    },
    setPlayEnabled(enabled) {
      el.play.disabled = !enabled;
    },
  };
}
