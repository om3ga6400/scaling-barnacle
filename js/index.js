import { WEAPON_CATEGORIES, WEAPON_STATS } from "/data/weapon-data.js";

const STATS = [
  { key: "damage_max", label: "damage max" },
  { key: "damage_min", label: "damage min" },
  { key: "pellet_count", label: "pellet count" },
  { key: "_sep_damage", type: "separator" },
  { key: "damage_falloff_start", label: "damage fall-off start" },
  { key: "max_bullet_range", label: "max bullet range" },
  { key: "_sep_range", type: "separator" },
  { key: "firerate", label: "firerate (rpm)" },
  { key: "_sep_firerate", type: "separator" },
  { key: "hip_fire_accuracy", label: "hip fire accuracy" },
  { key: "ads_accuracy", label: "ads accuracy" },
  { key: "_sep_accuracy", type: "separator" },
  { key: "vertical_recoil", label: "vertical recoil" },
  { key: "horizontal_recoil", label: "horizontal recoil" },
  { key: "_sep_recoil", type: "separator" },
  { key: "head_multiplier", label: "head multiplier" },
  { key: "torso_multiplier", label: "torso multiplier" },
  { key: "limb_multiplier", label: "limb multiplier" },
  { key: "_sep_mult", type: "separator" },
  { key: "reload_speed_partial", label: "reload speed (with ammo)" },
  { key: "reload_speed_empty", label: "reload speed (empty)" },
  { key: "_sep_reload", type: "separator" },
  { key: "equip_speed", label: "equip speed" },
  { key: "aim_speed", label: "aim speed" },
  { key: "_sep_handling", type: "separator" },
  { key: "weight", label: "weight" },
  { key: "ammo", label: "ammo" },
];

const $id = (id) => document.getElementById(id);
const elements = {
  grid: $id("grid"),
  search: $id("search"),
  objective: $id("objective"),
  weightLimit: $id("weightLimit"),
  gunType: $id("gunType"),
  bodyPart: $id("bodyPart"),
  weapon1Select: $id("weapon1"),
  weapon2Select: $id("weapon2"),
  comparisonResults: $id("comparisonResults"),
};

const el = (tag, cls = "", html = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

const parseMag = (txt) => {
  if (txt == null || txt === "") return null;
  const str = String(txt).toLowerCase();
  if (str === "inf") return Infinity;
  const match = str.match(/\d+/);
  return match ? Number(match[0]) : null;
};

const isDamageObjective = (key) => !!key && (key.includes("damage") || key.includes("dps"));

// Cache these calculations once instead of recalculating on every access
const GUNS = Object.values(WEAPON_CATEGORIES).flatMap((c) => c.weapons || []);

const GUN_TYPES = (() => {
  const types = {};
  Object.entries(WEAPON_CATEGORIES).forEach(([catName, catData]) => {
    const type = catData.type;
    (catData.weapons || []).forEach((w) => {
      let t = type;
      if (catName === "Special") {
        const name = String(w).toLowerCase();
        if (name.includes("pistol")) t = "pistol";
        else if (name.includes("musket")) t = "rifle";
      }
      types[w] = t;
    });
  });
  return types;
})();

// Pre-compute empty stats template once
const EMPTY_STATS = STATS.reduce((acc, s) => {
  acc[s.key] = null;
  return acc;
}, {});

const GUN_STATS = (() => {
  const stats = {};
  GUNS.forEach((name) => {
    stats[name] = { ...EMPTY_STATS, ...(WEAPON_STATS[name] || {}) };
  });
  return stats;
})();

// Cache shotgun list for O(1) lookups
const SHOTGUN_SET = new Set(WEAPON_CATEGORIES["Shotguns"]?.weapons || []);

function isShotgun(name) {
  return SHOTGUN_SET.has(name);
}

// Simplified multiplier lookup
const BODY_MULTIPLIER_MAP = {
  head: "head_multiplier",
  torso: "torso_multiplier",
  limb: "limb_multiplier",
};

function damageForBodyPart(stats = {}, damageKey = "damage_max", body = "base", pelletOverride = null) {
  const base = toNumber(stats[damageKey]);
  if (base == null) return null;

  const pellets = pelletOverride != null ? pelletOverride : toNumber(stats.pellet_count) || 1;
  const total = base * pellets;

  if (body === "base") return total;

  const multKey = BODY_MULTIPLIER_MAP[body];
  const mult = multKey ? toNumber(stats[multKey]) || 1 : 1;
  return total * mult;
}

function damagePerOneShot(stats = {}, damageKey = "damage_max", body = "base", pelletOverride = null) {
  const base = toNumber(stats[damageKey]);
  if (base == null) return null;

  const pellets = pelletOverride != null ? pelletOverride : toNumber(stats.pellet_count) || 1;
  const multKey = BODY_MULTIPLIER_MAP[body];
  const mult = multKey ? toNumber(stats[multKey]) || 1 : 1;

  return pellets * (base * mult);
}

function formatStatValue(key, value) {
  return value == null ? "—" : String(value);
}

const formatDamageWithPellets = (v) => (v == null ? "—" : String(Math.round(v)));

const computeDPSDetails = (stats) => {
  const body = elements.bodyPart?.value || "base";
  const rpm = toNumber(stats.firerate);
  const damageMax = toNumber(stats.damage_max);

  if (rpm == null || damageMax == null) return null;

  const mag = parseMag(stats.ammo);
  const shotsPerSecond = rpm / 60;
  const perShotFull = damageForBodyPart(stats, "damage_max", body);

  if (perShotFull == null) return null;

  const limitedShots = Number.isFinite(mag) ? Math.min(mag, shotsPerSecond) : shotsPerSecond;

  return {
    dios: perShotFull * limitedShots,
    shotsPerSecond: limitedShots,
    mag,
    perShotFull,
  };
};

const computeDPSScore = (stats) => computeDPSDetails(stats)?.dios ?? null;

const lowerIsBetterStats = new Set(["vertical_recoil", "horizontal_recoil", "reload_speed_partial", "reload_speed_empty", "equip_speed", "aim_speed", "weight"]);

function makeObjective(label, better, key, formatter = null) {
  const score = (s, gunName = null) => {
    switch (key) {
      case "damage_max":
      case "damage_min": {
        const pelletOverride = key === "damage_min" && isShotgun(gunName) ? 1 : null;
        return damageForBodyPart(s, key, elements.bodyPart?.value || "base", pelletOverride);
      }
      case "damage_per_shot":
        return damagePerOneShot(s, "damage_max", elements.bodyPart?.value || "base");
      case "dps":
        return computeDPSScore(s);
      case "recoil_combined": {
        const v = toNumber(s.vertical_recoil);
        const h = toNumber(s.horizontal_recoil);
        return v == null || h == null ? null : Math.hypot(v, h);
      }
      case "mag_size":
        return parseMag(s.ammo);
      default:
        return toNumber(s[key]);
    }
  };
  return { label, better, score, format: formatter };
}

const OBJECTIVES = {
  damage_max: makeObjective("Damage (max)", "desc", "damage_max", formatDamageWithPellets),
  damage_min: makeObjective("Damage (min)", "desc", "damage_min", formatDamageWithPellets),
  damage_per_shot: makeObjective("Damage per 1-shot", "desc", "damage_per_shot", (v) => (v == null ? "—" : String(Math.round(v)))),
  firerate: makeObjective("Firerate", "desc", "firerate"),
  dps: makeObjective("DIOS", "desc", "dps", (_v, stats) => {
    const d = computeDPSDetails(stats || {});
    if (!d) return "—";
    const mag = d.mag === Infinity ? "∞" : d.mag == null ? "—" : String(d.mag);
    const shots = d.shotsPerSecond != null ? Math.round(d.shotsPerSecond * 100) / 100 : "—";
    const diosStr = d.dios != null ? Math.round(d.dios).toLocaleString() : "—";
    return `${diosStr} DIOS · ${shots} shots/s · mag ${mag}`;
  }),
  ads_accuracy: makeObjective("ADS accuracy", "desc", "ads_accuracy", (v) => (v != null ? `${v}` : "—")),
  hip_accuracy: makeObjective("Hip fire accuracy", "desc", "hip_fire_accuracy", (v) => (v != null ? `${v}` : "—")),
  recoil: makeObjective("Recoil", "asc", "recoil_combined"),
  reload_partial: makeObjective("Reload (with ammo)", "asc", "reload_speed_partial", (v) => (v != null ? `${v}s` : "—")),
  reload_empty: makeObjective("Reload (empty)", "asc", "reload_speed_empty", (v) => (v != null ? `${v}s` : "—")),
  equip: makeObjective("Equip speed", "asc", "equip_speed", (v) => (v != null ? `${v}s` : "—")),
  aim: makeObjective("Aim speed", "asc", "aim_speed", (v) => (v != null ? `${v}s` : "—")),
  weight: makeObjective("Weight", "asc", "weight", (v) => (v != null ? `${v}` : "—")),
  ammo: makeObjective("Mag size", "desc", "mag_size"),
};

function formatScore(objKey, val, gunName = null) {
  const fmt = OBJECTIVES[objKey]?.format;
  if (fmt) return fmt(val, gunName ? GUN_STATS[gunName] : null);
  if (val == null) return "—";
  const base = typeof val === "number" ? (val % 1 === 0 ? String(val) : val.toFixed(2)) : String(val);
  if (objKey === "firerate") return base + " RMP";
  return base;
}

function renderGunCard(name) {
  const stats = GUN_STATS[name] || {};
  const tmpl = document.getElementById("tmpl-card");
  const node = tmpl.content.cloneNode(true);
  const card = node.querySelector(".card");

  card.querySelector(".title span").textContent = name;
  const statsEl = card.querySelector(".stats");

  const fragment = document.createDocumentFragment();
  STATS.forEach((s) => {
    if (s.type === "separator") {
      fragment.appendChild(el("div", "stat-separator"));
      return;
    }
    if (s.key === "pellet_count" && !isShotgun(name)) return;

    const row = el("div", "field");
    const label = el("label", "", s.label || "");
    const value = el("div", "value", formatStatValue(s.key, stats[s.key]) || "—");

    row.append(label, value);
    fragment.appendChild(row);
  });

  statsEl.appendChild(fragment);
  return card;
}

function getFilteredWeapons() {
  const q = String(elements.search.value || "")
    .trim()
    .toLowerCase();
  const maxW = parseFloat(elements.weightLimit.value);
  const type = elements.gunType.value || "";

  return GUNS.filter((name) => {
    // Early returns for performance
    if (q && !name.toLowerCase().includes(q)) return false;

    if (!Number.isNaN(maxW)) {
      const w = toNumber(GUN_STATS[name]?.weight);
      if (w !== null && w > maxW) return false;
    }

    if (type && GUN_TYPES[name] !== type) return false;

    return true;
  });
}

function renderAll(filteredWeapons) {
  elements.grid.innerHTML = "";

  // Build filtered category map
  const byCategory = {};
  Object.entries(WEAPON_CATEGORIES).forEach(([cat, data]) => {
    const list = (data.weapons || []).filter((w) => filteredWeapons.includes(w));
    if (list.length) byCategory[cat] = list;
  });

  const frag = document.createDocumentFragment();

  Object.entries(byCategory).forEach(([cat, weapons]) => {
    const tmpl = document.getElementById("tmpl-category-section");
    const node = tmpl.content.cloneNode(true);
    const section = node.querySelector(".weapon-category");

    section.querySelector(".category-label").textContent = `${cat} (${weapons.length})`;

    const header = section.querySelector(".category-header");
    const content = section.querySelector(".category-content");
    const container = section.querySelector(".category-weapons");

    // Batch append weapon cards
    const weaponsFrag = document.createDocumentFragment();
    weapons.forEach((w) => weaponsFrag.appendChild(renderGunCard(w)));
    container.appendChild(weaponsFrag);

    header.addEventListener("click", () => {
      const collapsed = header.classList.contains("collapsed");
      header.classList.toggle("collapsed", !collapsed);
      content.classList.toggle("collapsed", !collapsed);
    });

    frag.appendChild(section);
  });

  elements.grid.appendChild(frag);
}

function renderTopPicks(filteredWeapons) {
  const container = $id("topPicks");
  const objKey = elements.objective.value;
  const obj = OBJECTIVES[objKey];

  if (!obj) {
    container.innerHTML = "";
    return;
  }

  const ranked = filteredWeapons.map((name) => ({ name, score: obj.score(GUN_STATS[name] || {}, name) })).filter((x) => x.score != null);

  if (!ranked.length) {
    container.innerHTML = `<div class="heading"><span class="label">Rankings:</span><span class="muted">No data for selected objective.</span></div>`;
    return;
  }

  ranked.sort((a, b) => (obj.better === "asc" ? a.score - b.score : b.score - a.score));

  const showAll = container.dataset.expanded === "true";
  const list = showAll ? ranked : ranked.slice(0, 3);

  container.innerHTML = "";

  const heading = el("div", "heading");
  heading.append(el("span", "label", "Rankings:"), el("span", "", obj.label));

  const right = el("div", "");
  right.style.marginLeft = "auto";

  if (ranked.length > 3) {
    const btn = el("button", "expand-btn", showAll ? "Show Top 3" : "Show All");
    btn.addEventListener("click", toggleTopPicks);
    right.appendChild(btn);
  }

  heading.appendChild(right);

  const pickList = el("div", "pick-list");
  const pickTmpl = document.getElementById("tmpl-pick");

  list.forEach((p, i) => {
    const node = pickTmpl.content.cloneNode(true);
    const item = node.querySelector(".pick");

    item.querySelector(".name").textContent = `${i + 1}. ${p.name}`;
    const scoreEl = item.querySelector(".score");

    if (objKey === "dps") {
      const d = computeDPSDetails(GUN_STATS[p.name] || {}) || {};
      scoreEl.textContent = d.dios != null ? Math.round(d.dios).toLocaleString() + " DIOS" : "—";
    } else {
      scoreEl.textContent = formatScore(objKey, p.score, p.name);
    }

    pickList.appendChild(item);
  });

  container.append(heading, pickList);
}

function toggleBodyPartSelector() {
  const selected = elements.objective.value;
  elements.bodyPart.style.display = isDamageObjective(selected) ? "inline-block" : "none";
}

function getCompareValue(stat, value, stats) {
  if ((stat.key === "damage_max" || stat.key === "damage_min") && value != null) {
    return value * (stats.pellet_count || 1);
  }
  return value;
}

function renderComparison(w1, w2, s1, s2) {
  const comparisonCard = el("div", "unified-comparison-card");
  const statsContainer = el("div", "comparison-stats-grid");

  const fragment = document.createDocumentFragment();

  STATS.forEach((stat) => {
    if (stat.type === "separator") {
      const sepRow = el("div", "stat-separator-row");
      sepRow.appendChild(el("div", "stat-separator-unified"));
      fragment.appendChild(sepRow);
      return;
    }

    if (stat.key === "pellet_count" && !isShotgun(w1) && !isShotgun(w2)) return;

    const v1 = s1[stat.key];
    const v2 = s2[stat.key];
    const d1 = formatStatValue(stat.key, v1);
    const d2 = formatStatValue(stat.key, v2);

    let betterA = false,
      betterB = false,
      isEqual = false;

    if (v1 != null && v2 != null) {
      if (v1 === v2) {
        isEqual = true;
      } else {
        const cv1 = stat.key === "damage_min" && isShotgun(w1) ? getCompareValue(stat, v1, { ...s1, pellet_count: 1 }) : getCompareValue(stat, v1, s1);
        const cv2 = stat.key === "damage_min" && isShotgun(w2) ? getCompareValue(stat, v2, { ...s2, pellet_count: 1 }) : getCompareValue(stat, v2, s2);

        const higherIsBetter = !lowerIsBetterStats.has(stat.key);

        if (higherIsBetter) {
          betterA = cv1 > cv2;
          betterB = cv2 > cv1;
        } else {
          betterA = cv1 < cv2;
          betterB = cv2 < cv1;
        }
      }
    }

    const row = el("div", "stat-row");

    const classA = `stat-value left ${betterA ? "better" : ""} ${!betterA && betterB ? "worse" : ""} ${isEqual ? "equal" : ""}`.trim();
    const classB = `stat-value right ${betterB ? "better" : ""} ${!betterB && betterA ? "worse" : ""} ${isEqual ? "equal" : ""}`.trim();

    const value1 = el("div", classA, d1);
    const label = el("div", "stat-label", stat.label || "");
    const value2 = el("div", classB, d2);

    row.append(value1, label, value2);
    fragment.appendChild(row);
  });

  statsContainer.appendChild(fragment);
  comparisonCard.appendChild(statsContainer);

  elements.weapon1Select.classList.add("has-comparison", "unified-left");
  elements.weapon2Select.classList.add("has-comparison", "unified-right");

  const wrapper = el("div", "unified-comparison-wrapper");
  wrapper.appendChild(comparisonCard);
  elements.weapon1Select.parentElement.appendChild(wrapper);

  elements.comparisonResults.classList.add("active");
}

function hideComparison() {
  elements.weapon1Select.classList.remove("has-comparison", "unified-left");
  elements.weapon2Select.classList.remove("has-comparison", "unified-right");
  document.querySelectorAll(".unified-comparison-wrapper").forEach((el) => el.remove());
  elements.comparisonResults.classList.remove("active");
}

function compareWeapons() {
  const w1 = elements.weapon1Select.value;
  const w2 = elements.weapon2Select.value;

  if (!w1 || !w2) {
    hideComparison();
    return;
  }

  const s1 = GUN_STATS[w1];
  const s2 = GUN_STATS[w2];

  if (!s1 || !s2) {
    hideComparison();
    return;
  }

  hideComparison();
  renderComparison(w1, w2, s1, s2);
}

function createCustomSelect(placeholder, onChange) {
  const container = el("div", "custom-select");
  const trigger = el("div", "custom-select-trigger");
  trigger.innerHTML = `<span>${placeholder}</span><span class="arrow">▼</span>`;
  const options = el("div", "custom-select-options");

  // Collect and sort all weapons once
  const allWeapons = Object.values(WEAPON_CATEGORIES)
    .flatMap((cat) => cat.weapons || [])
    .sort();

  const fragment = document.createDocumentFragment();
  allWeapons.forEach((w) => {
    const opt = el("div", "custom-select-option");
    opt.textContent = w;
    opt.dataset.value = w;
    fragment.appendChild(opt);
  });
  options.appendChild(fragment);

  container.append(trigger, options);
  container.value = "";

  trigger.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll(".custom-select.open").forEach((el) => {
      if (el !== container) el.classList.remove("open");
    });
    container.classList.toggle("open");
  };

  options.onclick = (e) => {
    const opt = e.target.closest(".custom-select-option");
    if (!opt) return;

    trigger.firstChild.textContent = opt.textContent;
    options.querySelectorAll(".selected").forEach((o) => o.classList.remove("selected"));
    opt.classList.add("selected");
    container.classList.remove("open");
    container.value = opt.dataset.value;

    if (onChange) onChange(opt.dataset.value);
  };

  document.addEventListener("click", () => container.classList.remove("open"));

  return container;
}

function populateWeaponDropdowns() {
  const s1 = createCustomSelect("Select Weapon 1", compareWeapons);
  s1.id = elements.weapon1Select.id;
  s1.classList.add("weapon-select-1");
  elements.weapon1Select.replaceWith(s1);
  elements.weapon1Select = s1;

  const s2 = createCustomSelect("Select Weapon 2", compareWeapons);
  s2.id = elements.weapon2Select.id;
  s2.classList.add("weapon-select-2");
  elements.weapon2Select.replaceWith(s2);
  elements.weapon2Select = s2;
}

function updateDisplay() {
  const filtered = getFilteredWeapons();
  toggleBodyPartSelector();
  renderTopPicks(filtered);
  renderAll(filtered);
}

function toggleTopPicks() {
  const container = $id("topPicks");
  container.dataset.expanded = container.dataset.expanded === "true" ? "false" : "true";
  updateDisplay();
}

function initEventListeners() {
  elements.search.addEventListener("input", updateDisplay);
  elements.weightLimit.addEventListener("input", updateDisplay);
  elements.gunType.addEventListener("change", updateDisplay);
  elements.bodyPart?.addEventListener("change", updateDisplay);
  elements.objective.addEventListener("change", updateDisplay);
  elements.objective.addEventListener("input", updateDisplay);
}

globalThis.toggleTopPicks = toggleTopPicks;

populateWeaponDropdowns();
toggleBodyPartSelector();
updateDisplay();
initEventListeners();
