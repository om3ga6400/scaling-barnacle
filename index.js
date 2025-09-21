import { WEAPON_CATEGORIES, WEAPON_STATS } from './weapon-data.js';

const STATS = [
  { key: "damage_max", label: "damage max", type: "number" },
  { key: "damage_min", label: "damage min", type: "number" },
  { key: "pellet_count", label: "pellet count", type: "number" },
  { key: "_separator_damage", type: "separator", label: "" },
  { key: "damage_falloff_start", label: "damage fall-off start", type: "number" },
  { key: "max_bullet_range", label: "max bullet range", type: "number" },
  { key: "_separator_range", type: "separator", label: "" },
  { key: "firerate", label: "firerate (rpm)", type: "number" },
  { key: "_separator_firerate", type: "separator", label: "" },
  { key: "hip_fire_accuracy", label: "hip fire accuracy", type: "number" },
  { key: "ads_accuracy", label: "ads accuracy", type: "number" },
  { key: "_separator_accuracy", type: "separator", label: "" },
  { key: "vertical_recoil", label: "vertical recoil", type: "number" },
  { key: "horizontal_recoil", label: "horizontal recoil", type: "number" },
  { key: "_separator_recoil", type: "separator", label: "" },
  { key: "head_multiplier", label: "head multiplier", type: "number" },
  { key: "torso_multiplier", label: "torso multiplier", type: "number" },
  { key: "limb_multiplier", label: "limb multiplier", type: "number" },
  { key: "_separator_multipliers", type: "separator", label: "" },
  { key: "reload_speed_partial", label: "reload speed (with ammo)", type: "number" },
  { key: "reload_speed_empty", label: "reload speed (empty)", type: "number" },
  { key: "_separator_reload", type: "separator", label: "" },
  { key: "equip_speed", label: "equip speed", type: "number" },
  { key: "aim_speed", label: "aim speed", type: "number" },
  { key: "_separator_handling", type: "separator", label: "" },
  { key: "weight", label: "weight", type: "number" },
  { key: "ammo", label: "ammo", type: "text" }
];

const GUNS = Object.values(WEAPON_CATEGORIES).flatMap(cat => cat.weapons);
const GUN_TYPES = Object.entries(WEAPON_CATEGORIES).reduce((acc, [catName, catData]) => {
  catData.weapons.forEach(weapon => {
    let type = catData.type;
    if (catName === "Special") {
      const name = weapon.toLowerCase();
      if (name.includes("pistol")) type = "pistol";
      else if (name.includes("musket")) type = "rifle";
    }
    acc[weapon] = type;
  });
  return acc;
}, {});

const EMPTY_STATS = STATS.reduce((acc, s) => ((acc[s.key] = null), acc), {});
const GUN_STATS = Object.fromEntries(
  GUNS.map((name) => [name, { ...EMPTY_STATS, ...WEAPON_STATS[name] }])
);

const elements = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  objective: document.getElementById("objective"),
  weightLimit: document.getElementById("weightLimit"),
  gunType: document.getElementById("gunType"),
  bodyPart: document.getElementById("bodyPart"),
  weapon1Select: document.getElementById("weapon1"),
  weapon2Select: document.getElementById("weapon2"),
  comparisonResults: document.getElementById("comparisonResults")
};

const utils = {
  toNum: v => (v === null || v === undefined || v === "") ? null : Number.isFinite(Number(v)) ? Number(v) : null,
  parseMag: text => text && typeof text === "string" ? (text.match(/\d+/)?.[0] ? Number(text.match(/\d+/)[0]) : null) : null,
  isDamageRelatedObjective: objKey => objKey.includes("damage") || objKey.includes("dps"),
  isShotgun: weaponName => WEAPON_CATEGORIES["Shotguns"].weapons.includes(weaponName),
  createElement: (tag, className, innerHTML = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  }
};

function calculateDamageWithBodyPart(stats, damageType, bodyPart = "base") {
  const baseDamage = utils.toNum(stats[damageType]);
  if (baseDamage == null) return null;

  const pelletCount = utils.toNum(stats.pellet_count) || 1;
  const totalBaseDamage = baseDamage * pelletCount;

  if (bodyPart === "base") return totalBaseDamage;

  const multiplierMap = {
    head: stats.head_multiplier,
    torso: stats.torso_multiplier,
    limb: stats.limb_multiplier
  };
  const multiplier = utils.toNum(multiplierMap[bodyPart]) || 1;
  return totalBaseDamage * multiplier;
}

function formatDamageWithPellets(value, stats) {
  if (value == null) return "—";
  const pelletCount = utils.toNum(stats?.pellet_count);
  if (pelletCount && pelletCount > 1) {
    const perPellet = utils.toNum(stats?.damage_max) ?? utils.toNum(stats?.damage_min);
    return `${Math.round(value)} (${perPellet} × ${pelletCount})`;
  }
  return Math.round(value).toString();
}

function calculateDPS(stats) {
  const selectedBodyPart = elements.bodyPart?.value || "base";
  const dmg = calculateDamageWithBodyPart(stats, "damage_max", selectedBodyPart);
  const rpm = utils.toNum(stats.firerate);

  if (dmg == null || rpm == null) return null;

  const magSize = utils.parseMag(stats.ammo);
  if (magSize === 1) return dmg;

  const roundsPerSecond = rpm / 60;

  const effectiveRoundsPerSecond = Math.min(roundsPerSecond, magSize);

  return dmg * effectiveRoundsPerSecond;
}

const createObjective = (label, better, scoreKey, formatter = null) => ({
  label,
  better,
  score: (s) => {
    if (scoreKey === "damage_max" || scoreKey === "damage_min") {
      const selectedBodyPart = elements.bodyPart?.value || "base";
      return calculateDamageWithBodyPart(s, scoreKey, selectedBodyPart);
    }
    if (scoreKey === "dps") return calculateDPS(s);
    if (scoreKey === "recoil_combined") {
      const v = utils.toNum(s.vertical_recoil);
      const h = utils.toNum(s.horizontal_recoil);
      return (v == null || h == null) ? null : Math.hypot(v, h);
    }
    if (scoreKey === "mag_size") return utils.parseMag(s.ammo);
    return utils.toNum(s[scoreKey]);
  },
  format: formatter
});

const OBJECTIVES = {
  damage_max: createObjective("Damage (max)", "desc", "damage_max", formatDamageWithPellets),
  damage_min: createObjective("Damage (min)", "desc", "damage_min", formatDamageWithPellets),
  firerate: createObjective("Firerate", "desc", "firerate"),
  dps: createObjective("DPS", "desc", "dps", (v) => v != null ? `${Math.round(v).toLocaleString()} DPS` : "—"),
  accuracy: createObjective("Hip fire accuracy", "desc", "hip_fire_accuracy", (v) => v != null ? `${v}%` : "—"),
  ads_accuracy: createObjective("ADS accuracy", "desc", "ads_accuracy", (v) => v != null ? `${v}%` : "—"),
  recoil: createObjective("Recoil", "asc", "recoil_combined"),
  reload_partial: createObjective("Reload (with ammo)", "asc", "reload_speed_partial", (v) => v != null ? `${v}s` : "—"),
  reload_empty: createObjective("Reload (empty)", "asc", "reload_speed_empty", (v) => v != null ? `${v}s` : "—"),
  equip: createObjective("Equip speed", "asc", "equip_speed", (v) => v != null ? `${v}s` : "—"),
  aim: createObjective("Aim speed", "asc", "aim_speed", (v) => v != null ? `${v}s` : "—"),
  weight: createObjective("Weight", "asc", "weight", (v) => v != null ? `${v}` : "—"),
  ammo: createObjective("Mag size", "desc", "mag_size")
};

const formatScore = (objKey, val, gunName = null) => {
  const fmt = OBJECTIVES[objKey]?.format;
  if (fmt) return fmt(val, gunName ? GUN_STATS[gunName] : null);
  if (val == null) return "—";
  return typeof val === "number" ? (val % 1 === 0 ? String(val) : val.toFixed(2)) : String(val);
};

function renderGunCard(name) {
  const card = utils.createElement("div", "card");
  const header = utils.createElement("div", "card-header");
  const left = utils.createElement("div", "title", `<span>${name}</span>`);
  header.append(left);

  const stats = utils.createElement("div", "stats");

  STATS.forEach((s) => {
    if (s.type === "separator") {
      stats.append(utils.createElement("div", "stat-separator"));
    } else {
      if (s.key === "pellet_count" && !utils.isShotgun(name)) return;

      const wrapper = utils.createElement("div", "field");
      const label = utils.createElement("label");
      label.textContent = s.label;
      const span = utils.createElement("div", "value");
      const value = GUN_STATS[name]?.[s.key];

      if ((s.key === "damage_max" || s.key === "damage_min") && value != null) {
        const pelletCount = GUN_STATS[name]?.pellet_count;
        span.textContent = (pelletCount && pelletCount > 1 && utils.isShotgun(name))
          ? `${value} x ${pelletCount} = ${value * pelletCount}`
          : value;
      } else {
        span.textContent = value ?? "—";
      }

      wrapper.append(label, span);
      stats.append(wrapper);
    }
  });

  card.append(header, stats);
  return card;
}

const getFilteredWeapons = () => {
  const filter = elements.search.value.trim().toLowerCase();
  const maxWeight = parseFloat(elements.weightLimit.value) || null;
  const selectedGunType = elements.gunType.value;

  return GUNS.filter(weapon => {
    if (!weapon.toLowerCase().includes(filter)) return false;
    if (maxWeight !== null && maxWeight !== "") {
      const gunWeight = utils.toNum(GUN_STATS[weapon]?.weight);
      if (gunWeight !== null && gunWeight > maxWeight) return false;
    }
    if (selectedGunType && selectedGunType !== "" && GUN_TYPES[weapon] !== selectedGunType) return false;
    return true;
  });
};

const updateDisplay = () => {
  const filteredWeapons = getFilteredWeapons();
  toggleBodyPartSelector();
  renderTopPicks(filteredWeapons);
  renderAll(filteredWeapons);
};

function renderAll(filteredWeapons) {
  elements.grid.innerHTML = "";
  const weaponsByCategory = {};

  Object.entries(WEAPON_CATEGORIES).forEach(([categoryName, categoryData]) => {
    const categoryWeapons = categoryData.weapons.filter(weapon => filteredWeapons.includes(weapon));
    if (categoryWeapons.length > 0) {
      weaponsByCategory[categoryName] = categoryWeapons;
    }
  });

  Object.entries(weaponsByCategory).forEach(([categoryName, weapons]) => {
    const categorySection = utils.createElement('div', 'weapon-category');
    const categoryHeader = utils.createElement('div', 'category-header collapsed', `
      <span>${categoryName} (${weapons.length})</span>
      <span class="toggle-icon">▼</span>
    `);
    const categoryContent = utils.createElement('div', 'category-content collapsed');
    const categoryWeapons = utils.createElement('div', 'category-weapons');

    weapons.forEach((weapon) => {
      categoryWeapons.appendChild(renderGunCard(weapon));
    });

    categoryContent.appendChild(categoryWeapons);

    categoryHeader.addEventListener('click', () => {
      const isCollapsed = categoryHeader.classList.contains('collapsed');
      if (isCollapsed) {
        categoryHeader.classList.remove('collapsed');
        categoryContent.classList.remove('collapsed');
      } else {
        categoryHeader.classList.add('collapsed');
        categoryContent.classList.add('collapsed');
      }
    });

    categorySection.appendChild(categoryHeader);
    categorySection.appendChild(categoryContent);
    elements.grid.appendChild(categorySection);
  });
}

function renderTopPicks(filteredWeapons) {
  const container = document.getElementById("topPicks");
  const objKey = elements.objective.value;
  const obj = OBJECTIVES[objKey];
  if (!obj) {
    container.innerHTML = "";
    return;
  }

  const ranked = filteredWeapons
    .map((name) => {
      const s = GUN_STATS[name] || {};
      const score = obj.score(s);
      return { name, score };
    })
    .filter((x) => x.score != null);

  if (!ranked.length) {
    container.innerHTML = `<div class="heading"><span class="label">Rankings:</span><span class="muted">No data for selected objective.</span></div>`;
    return;
  }

  ranked.sort((a, b) =>
    obj.better === "asc" ? a.score - b.score : b.score - a.score
  );

  const top5 = ranked.slice(0, 5);
  const showAll = container.dataset.expanded === "true";
  const displayList = showAll ? ranked : top5;

  const list = displayList
    .map(
      ({ name, score }, index) =>
        `<div class="pick">
<span class="name">${index + 1}. ${name}</span>
<span class="score">${formatScore(objKey, score, name)}</span>
</div>`
    )
    .join("");

  const expandButton = ranked.length > 5 ?
    `<button class="expand-btn" onclick="toggleTopPicks()">${showAll ? 'Show Top 5' : 'Show All'}</button>` : '';

  container.innerHTML = `
<div class="heading">
<span class="label">Rankings:</span>
<span>${obj.label}</span>
<div style="margin-left: auto;">${expandButton}</div>
</div>
<div class="pick-list">${list}</div>
`;
}

function toggleBodyPartSelector() {
  const selectedObjective = elements.objective.value;
  if (utils.isDamageRelatedObjective(selectedObjective)) {
    elements.bodyPart.style.display = "inline-block";
  } else {
    elements.bodyPart.style.display = "none";
  }
}

function toggleTopPicks() {
  const container = document.getElementById("topPicks");
  const isExpanded = container.dataset.expanded === "true";
  container.dataset.expanded = isExpanded ? "false" : "true";
  updateDisplay();
}

function populateWeaponDropdowns() {
  let optionsHtml = '<option value="">Select Weapon</option>';

  Object.entries(WEAPON_CATEGORIES).forEach(([categoryName, categoryData]) => {
    if (categoryData.weapons.length === 0) return;

    optionsHtml += `<optgroup label="${categoryName}">`;
    categoryData.weapons.sort().forEach(weapon => {
      optionsHtml += `<option value="${weapon}">${weapon}</option>`;
    });
    optionsHtml += `</optgroup>`;
  });

  elements.weapon1Select.innerHTML = optionsHtml.replace('Select Weapon', 'Select Weapon 1');
  elements.weapon2Select.innerHTML = optionsHtml.replace('Select Weapon', 'Select Weapon 2');
}

function compareWeapons() {
  const weapon1 = elements.weapon1Select.value;
  const weapon2 = elements.weapon2Select.value;

  if (!weapon1 || !weapon2) {
    elements.comparisonResults.classList.remove('active');
    return;
  }

  const stats1 = GUN_STATS[weapon1];
  const stats2 = GUN_STATS[weapon2];

  if (!stats1 || !stats2) {
    elements.comparisonResults.classList.remove('active');
    return;
  }

  renderComparison(weapon1, weapon2, stats1, stats2);
}

const lowerIsBetterStats = new Set([
  'vertical_recoil', 'horizontal_recoil', 'reload_speed_partial',
  'reload_speed_empty', 'equip_speed', 'aim_speed', 'weight'
]);

function getCompareValue(stat, value, stats) {
  if ((stat.key === "damage_max" || stat.key === "damage_min") && value != null) {
    return value * (stats.pellet_count || 1);
  }
  return value;
}

function renderComparison(weapon1, weapon2, stats1, stats2) {
  const comparisonGrid = document.createElement('div');
  comparisonGrid.className = 'comparison-grid';

  const weapon1Col = document.createElement('div');
  weapon1Col.className = 'comparison-weapon';
  weapon1Col.innerHTML = `<h4>${weapon1}</h4>`;

  const weapon2Col = document.createElement('div');
  weapon2Col.className = 'comparison-weapon';
  weapon2Col.innerHTML = `<h4>${weapon2}</h4>`;

  STATS.forEach(stat => {
    if (stat.type === 'separator') return;

    if (stat.key === 'pellet_count' && !utils.isShotgun(weapon1) && !utils.isShotgun(weapon2)) {
      return;
    }

    const value1 = stats1[stat.key];
    const value2 = stats2[stat.key];

    const isDamageField = stat.key === "damage_max" || stat.key === "damage_min";
    const displayValue1 = isDamageField && stats1.pellet_count > 1
      ? `${value1} × ${stats1.pellet_count} = ${value1 * stats1.pellet_count}`
      : (value1 ?? "—");
    const displayValue2 = isDamageField && stats2.pellet_count > 1
      ? `${value2} × ${stats2.pellet_count} = ${value2 * stats2.pellet_count}`
      : (value2 ?? "—");

    let better1 = false, better2 = false;
    if (value1 != null && value2 != null && value1 !== value2) {
      const compareValue1 = getCompareValue(stat, value1, stats1);
      const compareValue2 = getCompareValue(stat, value2, stats2);

      const higherIsBetter = !lowerIsBetterStats.has(stat.key);
      if (higherIsBetter) {
        better1 = compareValue1 > compareValue2;
        better2 = compareValue2 > compareValue1;
      } else {
        better1 = compareValue1 < compareValue2;
        better2 = compareValue2 < compareValue1;
      }
    }

    const stat1Div = document.createElement('div');
    stat1Div.className = `comparison-stat ${better1 ? 'better' : ''}`;
    stat1Div.innerHTML = `<span>${stat.label}</span><span>${displayValue1}</span>`;

    const stat2Div = document.createElement('div');
    stat2Div.className = `comparison-stat ${better2 ? 'better' : ''}`;
    stat2Div.innerHTML = `<span>${stat.label}</span><span>${displayValue2}</span>`;

    weapon1Col.appendChild(stat1Div);
    weapon2Col.appendChild(stat2Div);
  });

  comparisonGrid.appendChild(weapon1Col);
  comparisonGrid.appendChild(document.createElement('div'));
  comparisonGrid.appendChild(weapon2Col);

  elements.comparisonResults.innerHTML = '';
  elements.comparisonResults.appendChild(comparisonGrid);
  elements.comparisonResults.classList.add('active');
}

function initializeEventListeners() {
  elements.search.addEventListener("input", updateDisplay);
  elements.weightLimit.addEventListener("input", updateDisplay);
  elements.gunType.addEventListener("change", updateDisplay);
  elements.bodyPart?.addEventListener("change", updateDisplay);
  elements.objective.addEventListener("change", updateDisplay);
  elements.objective.addEventListener("input", updateDisplay);
  elements.weapon1Select.addEventListener('change', compareWeapons);
  elements.weapon2Select.addEventListener('change', compareWeapons);
}

window.toggleTopPicks = toggleTopPicks;

populateWeaponDropdowns();
toggleBodyPartSelector();
updateDisplay();
initializeEventListeners();
