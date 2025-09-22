import { WEAPON_CATEGORIES, WEAPON_STATS } from './weapon-data.js';

const STATS = [
  { key: 'damage_max', label: 'damage max' },
  { key: 'damage_min', label: 'damage min' },
  { key: 'pellet_count', label: 'pellet count' },
  { key: '_sep_damage', type: 'separator' },
  { key: 'damage_falloff_start', label: 'damage fall-off start' },
  { key: 'max_bullet_range', label: 'max bullet range' },
  { key: '_sep_range', type: 'separator' },
  { key: 'firerate', label: 'firerate (rpm)' },
  { key: '_sep_firerate', type: 'separator' },
  { key: 'hip_fire_accuracy', label: 'hip fire accuracy' },
  { key: 'ads_accuracy', label: 'ads accuracy' },
  { key: '_sep_accuracy', type: 'separator' },
  { key: 'vertical_recoil', label: 'vertical recoil' },
  { key: 'horizontal_recoil', label: 'horizontal recoil' },
  { key: '_sep_recoil', type: 'separator' },
  { key: 'head_multiplier', label: 'head multiplier' },
  { key: 'torso_multiplier', label: 'torso multiplier' },
  { key: 'limb_multiplier', label: 'limb multiplier' },
  { key: '_sep_mult', type: 'separator' },
  { key: 'reload_speed_partial', label: 'reload speed (with ammo)' },
  { key: 'reload_speed_empty', label: 'reload speed (empty)' },
  { key: '_sep_reload', type: 'separator' },
  { key: 'equip_speed', label: 'equip speed' },
  { key: 'aim_speed', label: 'aim speed' },
  { key: '_sep_handling', type: 'separator' },
  { key: 'weight', label: 'weight' },
  { key: 'ammo', label: 'ammo' }
];

const $id = id => document.getElementById(id);
const elements = {
  grid: $id('grid'),
  search: $id('search'),
  objective: $id('objective'),
  weightLimit: $id('weightLimit'),
  gunType: $id('gunType'),
  bodyPart: $id('bodyPart'),
  weapon1Select: $id('weapon1'),
  weapon2Select: $id('weapon2'),
  comparisonResults: $id('comparisonResults')
};

const el = (tag, cls = '', html = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};

const toNumber = v => (v === null || v === undefined || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const parseMag = txt => {
  if (txt === '' || txt == null) return null;
  if (typeof txt === 'string' && txt.toLowerCase() === 'inf') return Infinity;
  const m = String(txt).match(/\d+/);
  return m ? Number(m[0]) : null;
};

const isDamageObjective = key => !!key && (key.includes('damage') || key.includes('dps'));
const GUNS = Object.values(WEAPON_CATEGORIES).flatMap(c => c.weapons || []);
const GUN_TYPES = Object.entries(WEAPON_CATEGORIES).reduce((map, [catName, catData]) => {
  const type = catData.type;
  (catData.weapons || []).forEach(w => {
    let t = type;
    if (catName === 'Special') {
      const name = String(w).toLowerCase();
      if (name.includes('pistol')) t = 'pistol';
      else if (name.includes('musket')) t = 'rifle';
    }
    map[w] = t;
  });
  return map;
}, {});

const EMPTY_STATS = STATS.reduce((acc, s) => { acc[s.key] = null; return acc; }, {});
const GUN_STATS = Object.fromEntries(GUNS.map(name => [name, { ...EMPTY_STATS, ...(WEAPON_STATS[name] || {}) }]));

function damageForBodyPart(stats = {}, damageKey = 'damage_max', body = 'base', pelletOverride = null) {
  const base = toNumber(stats[damageKey]);
  if (base == null) return null;
  const pellets = (pelletOverride != null) ? pelletOverride : (toNumber(stats.pellet_count) || 1);
  const total = base * pellets;
  if (body === 'base') return total;
  const mult = toNumber({ head: stats.head_multiplier, torso: stats.torso_multiplier, limb: stats.limb_multiplier }[body]) || 1;
  return total * mult;
}

function formatStatValue(key, value) {
  if (value == null) return '—';
  if (key === 'firerate') return String(value) + ' RMP';
  return String(value);
}
const formatDamageWithPellets = v => (v == null ? '—' : String(Math.round(v)));

function isShotgun(name) {
  return Array.isArray(WEAPON_CATEGORIES['Shotguns']?.weapons) && WEAPON_CATEGORIES['Shotguns'].weapons.includes(name);
}

const computeDPSDetails = stats => {
  // DIOS = D * P * min(A, F)
  const body = elements.bodyPart?.value || 'base';
  const rpm = toNumber(stats.firerate);
  if (rpm == null || toNumber(stats.damage_max) == null) return null;
  const mag = parseMag(stats.ammo);
  const rps = rpm / 60;
  const perShotFull = damageForBodyPart(stats, 'damage_max', body);
  const shotsInOneSecond = Number.isFinite(rps) ? rps : 0;
  const shotsLimitedByAmmo = Number.isFinite(mag) ? Math.min(mag, shotsInOneSecond) : shotsInOneSecond;
  const dios = perShotFull != null ? perShotFull * shotsLimitedByAmmo : null;
  return { dios, shotsPerSecond: shotsLimitedByAmmo, mag, perShotFull };
};
const computeDPSScore = stats => { const d = computeDPSDetails(stats); return d ? d.dios : null; };

const lowerIsBetterStats = new Set(['vertical_recoil', 'horizontal_recoil', 'reload_speed_partial', 'reload_speed_empty', 'equip_speed', 'aim_speed', 'weight']);

function makeObjective(label, better, key, formatter = null) {
  const score = (s, gunName = null) => {
    if (key === 'damage_max' || key === 'damage_min') {
      const pelletOverride = (key === 'damage_min' && isShotgun(gunName)) ? 1 : null;
      return damageForBodyPart(s, key, elements.bodyPart?.value || 'base', pelletOverride);
    }
    if (key === 'dps') return computeDPSScore(s);
    if (key === 'recoil_combined') {
      const v = toNumber(s.vertical_recoil), h = toNumber(s.horizontal_recoil);
      return (v == null || h == null) ? null : Math.hypot(v, h);
    }
    if (key === 'mag_size') return parseMag(s.ammo);
    return toNumber(s[key]);
  };
  return { label, better, score, format: formatter };
}

const OBJECTIVES = {
  damage_max: makeObjective('Damage (max)', 'desc', 'damage_max', formatDamageWithPellets),
  damage_min: makeObjective('Damage (min)', 'desc', 'damage_min', formatDamageWithPellets),
  firerate: makeObjective('Firerate', 'desc', 'firerate'),
  dps: makeObjective('DIOS', 'desc', 'dps', (v, stats) => {
    const d = computeDPSDetails(stats || {});
    if (!d) return '—';
    const mag = d.mag === Infinity ? '∞' : (d.mag == null ? '—' : String(d.mag));
    const shots = d.shotsPerSecond != null ? (Math.round(d.shotsPerSecond * 100) / 100) : '—';
    const diosStr = d.dios != null ? Math.round(d.dios).toLocaleString() : '—';
    return `${diosStr} DIOS · ${shots} shots/s · mag ${mag}`;
  }),
  ads_accuracy: makeObjective('ADS accuracy', 'desc', 'ads_accuracy', v => (v != null ? `${v}` : '—')),
  hip_accuracy: makeObjective('Hip fire accuracy', 'desc', 'hip_fire_accuracy', v => (v != null ? `${v}` : '—')),
  recoil: makeObjective('Recoil', 'asc', 'recoil_combined'),
  reload_partial: makeObjective('Reload (with ammo)', 'asc', 'reload_speed_partial', v => (v != null ? `${v}s` : '—')),
  reload_empty: makeObjective('Reload (empty)', 'asc', 'reload_speed_empty', v => (v != null ? `${v}s` : '—')),
  equip: makeObjective('Equip speed', 'asc', 'equip_speed', v => (v != null ? `${v}s` : '—')),
  aim: makeObjective('Aim speed', 'asc', 'aim_speed', v => (v != null ? `${v}s` : '—')),
  weight: makeObjective('Weight', 'asc', 'weight', v => (v != null ? `${v}` : '—')),
  ammo: makeObjective('Mag size', 'desc', 'mag_size')
};

function formatScore(objKey, val, gunName = null) {
  const fmt = OBJECTIVES[objKey]?.format;
  if (fmt) return fmt(val, gunName ? GUN_STATS[gunName] : null);
  if (val == null) return '—';
  const base = (typeof val === 'number') ? (val % 1 === 0 ? String(val) : val.toFixed(2)) : String(val);
  if (objKey === 'firerate') return base + ' RMP';
  return base;
}

function renderGunCard(name) {
  const stats = GUN_STATS[name] || {};
  const tmpl = document.getElementById('tmpl-card');
  const node = tmpl.content.cloneNode(true);
  const card = node.querySelector('.card');
  card.querySelector('.title span').textContent = name;
  const statsEl = card.querySelector('.stats');
  STATS.forEach(s => {
    if (s.type === 'separator') { statsEl.appendChild(el('div', 'stat-separator')); return; }
    if (s.key === 'pellet_count' && !isShotgun(name)) return;
    const row = el('div', 'field');
    const label = el('label', '', s.label || '');
    const value = el('div', 'value', formatStatValue(s.key, stats[s.key], stats) ?? '—');
  
    row.append(label, value);
    statsEl.appendChild(row);
  });
  return card;
}

function getFilteredWeapons() {
  const q = String(elements.search.value || '').trim().toLowerCase();
  const maxW = parseFloat(elements.weightLimit.value);
  const type = elements.gunType.value || '';
  return GUNS.filter(name => {
    if (!name.toLowerCase().includes(q)) return false;
    if (!Number.isNaN(maxW)) { const w = toNumber(GUN_STATS[name]?.weight); if (w !== null && w > maxW) return false; }
    if (type && GUN_TYPES[name] !== type) return false;
    return true;
  });
}

function renderAll(filteredWeapons) {
  elements.grid.innerHTML = '';
  const byCategory = {};
  Object.entries(WEAPON_CATEGORIES).forEach(([cat, data]) => {
    const list = (data.weapons || []).filter(w => filteredWeapons.includes(w));
    if (list.length) byCategory[cat] = list;
  });
  const frag = document.createDocumentFragment();
  Object.entries(byCategory).forEach(([cat, weapons]) => {
    const tmpl = document.getElementById('tmpl-category-section');
    const node = tmpl.content.cloneNode(true);
    const section = node.querySelector('.weapon-category');
    section.querySelector('.category-label').textContent = `${cat} (${weapons.length})`;
    const header = section.querySelector('.category-header');
    const content = section.querySelector('.category-content');
    const container = section.querySelector('.category-weapons');
    weapons.forEach(w => container.appendChild(renderGunCard(w)));
    header.addEventListener('click', () => { const collapsed = header.classList.contains('collapsed'); header.classList.toggle('collapsed', !collapsed); content.classList.toggle('collapsed', !collapsed); });
    frag.appendChild(section);
  });
  elements.grid.appendChild(frag);
}

function renderTopPicks(filteredWeapons) {
  const container = $id('topPicks');
  const objKey = elements.objective.value;
  const obj = OBJECTIVES[objKey];
  if (!obj) { container.innerHTML = ''; return; }
  const ranked = filteredWeapons.map(name => ({ name, score: obj.score(GUN_STATS[name] || {}, name) })).filter(x => x.score != null);
  if (!ranked.length) { container.innerHTML = `<div class="heading"><span class="label">Rankings:</span><span class="muted">No data for selected objective.</span></div>`; return; }
  ranked.sort((a, b) => (obj.better === 'asc' ? a.score - b.score : b.score - a.score));
  const showAll = container.dataset.expanded === 'true';
  const list = showAll ? ranked : ranked.slice(0, 5);
  container.innerHTML = '';
  const heading = el('div', 'heading'); heading.appendChild(el('span', 'label', 'Rankings:')); heading.appendChild(el('span', '', obj.label));
  const right = el('div', ''); right.style.marginLeft = 'auto'; if (ranked.length > 5) { const btn = el('button', 'expand-btn', showAll ? 'Show Top 5' : 'Show All'); btn.addEventListener('click', toggleTopPicks); right.appendChild(btn); }
  heading.appendChild(right);
  const pickList = el('div', 'pick-list');
  const pickTmpl = document.getElementById('tmpl-pick');
  list.forEach((p, i) => {
    const node = pickTmpl.content.cloneNode(true);
    const item = node.querySelector('.pick');
    item.querySelector('.name').textContent = `${i + 1}. ${p.name}`;
    const scoreEl = item.querySelector('.score');
    if (objKey === 'dps') {
      const stats = GUN_STATS[p.name] || {};
      const d = computeDPSDetails(stats) || {};
      const diosVal = d.dios ?? null;
      const diosStr = diosVal != null ? Math.round(diosVal).toLocaleString() + ' DIOS' : '—';
      scoreEl.textContent = diosStr;
      const mag = d.mag === Infinity ? '∞' : (d.mag == null ? '—' : String(d.mag));
      const shots = d.shotsPerSecond != null ? (Math.round(d.shotsPerSecond * 100) / 100) : '—';
  
    } else {
      const txt = formatScore(objKey, p.score, p.name);
      scoreEl.textContent = txt;
  
    }
    pickList.appendChild(item);
  });
  container.append(heading, pickList);
}

function toggleBodyPartSelector() {
  const selected = elements.objective.value;
  elements.bodyPart.style.display = isDamageObjective(selected) ? 'inline-block' : 'none';
}

function getCompareValue(stat, value, stats) {
  if ((stat.key === 'damage_max' || stat.key === 'damage_min') && value != null) return value * (stats.pellet_count || 1);
  return value;
}

function renderComparison(w1, w2, s1, s2) {
  const grid = el('div', 'comparison-grid');
  const cmpTmpl = document.getElementById('tmpl-comparison-weapon');
  const nodeA = cmpTmpl.content.cloneNode(true);
  const nodeB = cmpTmpl.content.cloneNode(true);
  const colA = nodeA.querySelector('.comparison-weapon'); colA.querySelector('h4').textContent = w1;
  const colB = nodeB.querySelector('.comparison-weapon'); colB.querySelector('h4').textContent = w2;

  STATS.forEach(stat => {
    if (stat.type === 'separator') return;
    if (stat.key === 'pellet_count' && !isShotgun(w1) && !isShotgun(w2)) return;

    const v1 = s1[stat.key];
    const v2 = s2[stat.key];
    const d1 = formatStatValue(stat.key, v1, s1);
    const d2 = formatStatValue(stat.key, v2, s2);

    let betterA = false, betterB = false;
    if (v1 != null && v2 != null && v1 !== v2) {
      const cv1 = (stat.key === 'damage_min' && isShotgun(w1)) ? getCompareValue(stat, v1, { ...s1, pellet_count: 1 }) : getCompareValue(stat, v1, s1);
      const cv2 = (stat.key === 'damage_min' && isShotgun(w2)) ? getCompareValue(stat, v2, { ...s2, pellet_count: 1 }) : getCompareValue(stat, v2, s2);
      const higherIsBetter = !lowerIsBetterStats.has(stat.key);
      if (higherIsBetter) { betterA = cv1 > cv2; betterB = cv2 > cv1; }
      else { betterA = cv1 < cv2; betterB = cv2 < cv1; }
    }

    const classA = `comparison-stat ${betterA ? 'better' : ''}`.trim();
    const classB = `comparison-stat ${betterB ? 'better' : ''}`.trim();

    const a = el('div', classA);
    a.appendChild(el('span', '', stat.label || ''));
  const aVal = el('span', '', d1);
  a.appendChild(aVal);

    const b = el('div', classB);
    b.appendChild(el('span', '', stat.label || ''));
  const bVal = el('span', '', d2);
  b.appendChild(bVal);

    colA.appendChild(a);
    colB.appendChild(b);
  });

  grid.append(colA, el('div'), colB);
  elements.comparisonResults.innerHTML = '';
  elements.comparisonResults.appendChild(grid);
  elements.comparisonResults.classList.add('active');
}

function compareWeapons() {
  const w1 = elements.weapon1Select.value;
  const w2 = elements.weapon2Select.value;
  if (!w1 || !w2) { elements.comparisonResults.classList.remove('active'); return; }
  const s1 = GUN_STATS[w1];
  const s2 = GUN_STATS[w2];
  if (!s1 || !s2) { elements.comparisonResults.classList.remove('active'); return; }
  renderComparison(w1, w2, s1, s2);
}

function makeGroupedSelect(placeholder) {
  const select = document.createElement('select');
  const empty = el('option'); empty.value = ''; empty.textContent = placeholder; select.appendChild(empty);
  Object.entries(WEAPON_CATEGORIES).forEach(([cat, data]) => {
    if (!(data.weapons || []).length) return;
    const g = document.createElement('optgroup'); g.label = cat;
    (data.weapons || []).slice().sort().forEach(w => {
      const o = el('option'); o.value = w; o.textContent = w; g.appendChild(o);
    });
    select.appendChild(g);
  });
  return select;
}

function populateWeaponDropdowns() {
  const s1 = makeGroupedSelect('Select Weapon 1');
  s1.id = elements.weapon1Select.id; s1.className = elements.weapon1Select.className;
  elements.weapon1Select.replaceWith(s1); elements.weapon1Select = s1;

  const s2 = makeGroupedSelect('Select Weapon 2');
  s2.id = elements.weapon2Select.id; s2.className = elements.weapon2Select.className;
  elements.weapon2Select.replaceWith(s2); elements.weapon2Select = s2;
}

function updateDisplay() {
  const filtered = getFilteredWeapons();
  toggleBodyPartSelector();
  renderTopPicks(filtered);
  renderAll(filtered);
}

function toggleTopPicks() {
  const container = $id('topPicks');
  container.dataset.expanded = (container.dataset.expanded === 'true') ? 'false' : 'true';
  updateDisplay();
}

function initEventListeners() {
  elements.search.addEventListener('input', updateDisplay);
  elements.weightLimit.addEventListener('input', updateDisplay);
  elements.gunType.addEventListener('change', updateDisplay);
  elements.bodyPart?.addEventListener('change', updateDisplay);
  elements.objective.addEventListener('change', updateDisplay);
  elements.objective.addEventListener('input', updateDisplay);
  elements.weapon1Select.addEventListener('change', compareWeapons);
  elements.weapon2Select.addEventListener('change', compareWeapons);
}

window.toggleTopPicks = toggleTopPicks;

populateWeaponDropdowns();
toggleBodyPartSelector();
updateDisplay();
initEventListeners();
