function normalizeAssetName(value) {
  let text = String(value || "").trim().toLowerCase();
  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = decodeURIComponent(escape(text));
      if (repaired === text) break;
      text = repaired.toLowerCase();
    } catch {
      break;
    }
  }
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ACHIEVEMENT_BADGES = new Map([
  ["abborre", "abborre-badge-v1.png"],
  ["mort", "mort-badge-v1.png"],
  ["gadda", "gadda-badge-v1.png"],
  ["braxen", "braxen-badge-v1.png"],
  ["gos", "gos-badge-v1.png"],
  ["lake", "lake-badge-v1.png"],
  ["ruda", "ruda-badge-v1.png"],
  ["sutare", "sutare-badge-v1.png"],
  ["id", "id-badge-v1.png"],
  ["bjorkna", "bjorkna-badge-v1.png"],
  ["forsta over 10 cm", "over10-badge-v1.png"],
  ["forsta over 25 cm", "first25cm-badge-v1.png"],
  ["din forsta bigplus", "bigplus-badge-v1.png"],
  ["5 arter fangade", "5art-badge-v1.png"],
  ["forsta verifierade", "forstaveri-badge-v1.png"],
  ["lagg till en van", "1van-badge-v1.png"],
  ["ga med i en grupp", "joingroup-badge-v1.png"],
  ["3 dagars streak", "3daystreak-badge-v1.png"],
  ["7 dagars streak", "7daystreak-badge-v1.png"]
]);

export function achievementBadgeImage(name) {
  const filename = ACHIEVEMENT_BADGES.get(normalizeAssetName(name));
  return filename ? `/bigplus/assets/achievements/${filename}` : "";
}

export function speciesReferenceImage(name) {
  const normalized = normalizeAssetName(name);
  if (normalized.includes("abborre")) return "/bigplus/assets/species/abborre.jpg";
  if (normalized.includes("gos")) return "/bigplus/assets/species/gos.jpg";
  if (normalized.includes("gadda")) return "/bigplus/assets/species/gadda.jpg";
  if (normalized.includes("oring")) return "/bigplus/assets/species/oring.jpg";
  return "/bigplus/assets/fangster-icon.png";
}
