export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

export function photoSource(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.url || value.secure_url || value.src || value.dataUrl || value.data || "";
}

export function displayValue(value, fallback = "") {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return fallback;
  return value.name || value.label || value.title || fallback;
}

export function formatCompetitionDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("sv-SE") : "Okänt datum";
}
