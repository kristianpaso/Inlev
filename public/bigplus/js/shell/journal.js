import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";

const JOURNAL_TRIPS_KEY = "bigplus_fishing_trips";

export function journalTrips() {
  try {
    const parsed = JSON.parse(localStorage.getItem(JOURNAL_TRIPS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournalTrips(trips) {
  localStorage.setItem(JOURNAL_TRIPS_KEY, JSON.stringify(trips));
}

export function formatJournalDate(value) {
  if (!value) return "Datum saknas";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return "Ingen plan";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function tripStatus(trip, today) {
  if (!trip.date) return "Flexibel";
  return trip.date >= today ? "Planerad" : "Genomf\u00f6rd";
}

function setText(selector, value) {
  const target = $(selector);
  if (target) target.textContent = value;
}

function updateJournalStats(trips, upcoming, past) {
  const nextTrip = upcoming[0];
  const nextLabel = nextTrip
    ? `${formatShortDate(nextTrip.date)}${nextTrip.location ? `, ${nextTrip.location}` : ""}`
    : "Ingen plan";
  const plannedHours = Math.max(0, upcoming.length * 4);
  const spots = Math.max(3, trips.filter((trip) => trip.location).length || 0);

  setText("#journalTotalTrips", String(trips.length));
  setText("#journalUpcomingCount", `${upcoming.length} kommande`);
  setText("#journalNextTripStat", nextLabel);
  setText("#journalPlannedHours", plannedHours ? `${plannedHours} h` : "0 h");
  setText("#journalSpotCount", String(spots));
}

export function renderJournalTrip(trip) {
  const today = new Date().toISOString().slice(0, 10);
  const details = [trip.location, trip.species]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" \u00b7 ");
  const meta = [trip.bait || "Bete ej valt", trip.weather || "V\u00e4der ej ifyllt"]
    .map((value) => `<span>${escapeHtml(String(value))}</span>`)
    .join("");
  const status = tripStatus(trip, today);

  return `<article class="journal-trip-card">
    <div class="journal-trip-date">
      <strong>${escapeHtml(formatJournalDate(trip.date))}</strong>
      <span>${escapeHtml(trip.time || "Flexibel tid")}</span>
      <em class="journal-trip-status">${escapeHtml(status)}</em>
    </div>
    <div class="journal-trip-body">
      <h3>${escapeHtml(String(trip.title || "Fisketur"))}</h3>
      <p>${details || "Ingen plats eller m\u00e5lart vald \u00e4nnu."}</p>
      <div class="journal-trip-meta">${meta}</div>
      ${trip.notes ? `<p class="journal-trip-notes">${escapeHtml(String(trip.notes))}</p>` : ""}
    </div>
  </article>`;
}

export function renderJournal() {
  const upcomingTarget = $("#journalUpcomingList");
  const pastTarget = $("#journalPastList");
  if (!upcomingTarget || !pastTarget) return;

  const today = new Date().toISOString().slice(0, 10);
  const trips = journalTrips().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const upcoming = trips.filter((trip) => !trip.date || trip.date >= today);
  const past = trips.filter((trip) => trip.date && trip.date < today).reverse();

  updateJournalStats(trips, upcoming, past);
  upcomingTarget.innerHTML = upcoming.length
    ? upcoming.map(renderJournalTrip).join("")
    : `<div class="empty-list"><strong>Inga planerade turer</strong><span>Planera n\u00e4sta tur med v\u00e4der, vind, spots och bete.</span></div>`;
  pastTarget.innerHTML = past.length
    ? past.map(renderJournalTrip).join("")
    : `<div class="empty-list"><strong>Din fiskeloggbok b\u00f6rjar h\u00e4r</strong><span>Avslutade turer kan fyllas p\u00e5 med bilder, resultat och l\u00e4rdomar senare.</span></div>`;
}

export function saveJournalTrip(event) {
  event.preventDefault();
  const trip = {
    id: `journal-${Date.now()}`,
    title: $("#journalTripTitle")?.value.trim() || "Fisketur",
    date: $("#journalTripDate")?.value || "",
    time: $("#journalTripTime")?.value || "",
    location: $("#journalTripLocation")?.value.trim() || "",
    species: $("#journalTripSpecies")?.value.trim() || "",
    bait: $("#journalTripBait")?.value.trim() || "",
    weather: $("#journalTripWeather")?.value.trim() || "",
    notes: $("#journalTripNotes")?.value.trim() || "",
    createdAt: new Date().toISOString(),
  };
  saveJournalTrips([...journalTrips(), trip]);
  event.currentTarget.reset();
  const planner = $("#journalPlanner");
  if (planner) planner.hidden = true;
  const status = $("#journalFormStatus");
  if (status) status.textContent = "Fisketuren \u00e4r sparad.";
  renderJournal();
}
