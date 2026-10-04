import {
  createIcons, MapPin, Search, Sun, Menu, Compass, Bookmark, MessagesSquare, ChevronDown, Copy, ArrowUp, ArrowDown, House, BriefcaseBusiness,
  ListFilter, Map, LayoutGrid, Layers3, ArrowUpRight, ArrowLeft, Plus, Info, Mail, Phone,
  Navigation, Move, Image, PanelRightClose, X, LockKeyhole, ShieldCheck, Send, UserRound,
  BedDouble, Ruler, BookmarkCheck, BadgeInfo, ArrowDownUp, SearchX, BookmarkX, Trash2, Eye, EyeOff
} from "lucide";
import { io } from "socket.io-client";
import { localeTags, translate } from "./locales.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const icons = { MapPin, Search, Sun, Menu, Compass, Bookmark, MessagesSquare, ChevronDown, Copy, ArrowUp, ArrowDown, House, BriefcaseBusiness, ListFilter, Map, LayoutGrid, Layers3, ArrowUpRight, ArrowLeft, Plus, Info, Mail, Phone, Navigation, Move, Image, PanelRightClose, X, LockKeyhole, ShieldCheck, Send, UserRound, BedDouble, Ruler, BookmarkCheck, BadgeInfo, ArrowDownUp, SearchX, BookmarkX, Trash2, Eye, EyeOff };
const state = {
  listings: [],
  visibleListings: [],
  user: null,
  favorites: new Set(),
  selectedId: null,
  mode: "buy",
  sort: "featured",
  minBeds: 0,
  listView: false,
  favoriteAfterAuth: null,
  authMode: "login",
  passwordResetToken: null
};

let activeLocale = "en";
try { activeLocale = localStorage.getItem("propertyhub_locale") || "en"; } catch {}
if (!localeTags[activeLocale]) activeLocale = "en";
const t = (key) => translate(activeLocale, key);

function applyLocale(locale = activeLocale) {
  activeLocale = localeTags[locale] ? locale : "en";
  document.documentElement.lang = localeTags[activeLocale];
  document.documentElement.dir = activeLocale === "ar" ? "rtl" : "ltr";
  try { localStorage.setItem("propertyhub_locale", activeLocale); } catch {}
  $$("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$("[data-i18n-html]").forEach((element) => { element.innerHTML = t(element.dataset.i18nHtml); });
  $$("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$("[data-i18n-aria]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria)); });
  const selector = $("#languageSelect");
  if (selector) selector.value = activeLocale;
  const today = $("#todayLabel");
  if (today) today.textContent = new Intl.DateTimeFormat(localeTags[activeLocale], { month: "long", year: "numeric" }).format(new Date());
}

try {
  document.documentElement.dataset.theme = localStorage.getItem("propertyhub_theme") === "light" ? "light" : "dark";
} catch {}

createIcons({ icons });
const socket = io({ transports: ["websocket", "polling"], reconnection: true, reconnectionDelayMax: 4000 });
const liveStatus = $("#liveStatus");
const currencyFilter = $("#currencyFilter");
const marketCurrency = () => currencyFilter.value;
$("#languageSelect").addEventListener("change", (event) => {
  applyLocale(event.target.value);
  updateBudgetOptions();
  renderListings();
  renderMarkers();
  setAuthMode(state.authMode);
});
function formatCurrency(amount, currency, compact = true) {
  try {
    return new Intl.NumberFormat(localeTags[activeLocale] || navigator.language || "en", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toLocaleString()}`;
  }
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
}
function setLiveStatus(status, label) {
  liveStatus.classList.toggle("connected", status === "connected");
  liveStatus.classList.toggle("offline", status === "offline");
  liveStatus.lastChild.textContent = label;
}

const budgetFilter = $("#budgetFilter");
function updateBudgetOptions() {
  const currency = marketCurrency();
  const choices = [["all", currency === "all" ? t("chooseCurrency") : t("anyBudget")]];
  if (currency !== "all") {
    const levels = state.mode === "rent"
      ? ({ INR: [30000, 50000, 100000, 200000], USD: [1500, 2500, 5000, 10000], EUR: [1000, 2000, 3500, 7000], GBP: [1000, 2000, 3500, 7000], AED: [3000, 6000, 12000, 24000], CAD: [1500, 2500, 5000, 10000], AUD: [1500, 2500, 5000, 10000], SGD: [1500, 2500, 5000, 10000], JPY: [150000, 300000, 600000, 1200000], CHF: [1200, 2400, 4000, 8000] }[currency] || [1000, 2500, 5000, 10000])
      : state.mode === "commercial"
        ? [100, 250, 500, 1000]
        : ({ INR: [5000000, 10000000, 20000000, 50000000], USD: [250000, 500000, 1000000, 2500000], EUR: [250000, 500000, 1000000, 2500000], GBP: [250000, 500000, 1000000, 2500000], AED: [500000, 1000000, 2500000, 5000000], CAD: [250000, 500000, 1000000, 2500000], AUD: [250000, 500000, 1000000, 2500000], SGD: [250000, 500000, 1000000, 2500000], JPY: [20000000, 50000000, 100000000, 250000000], CHF: [250000, 500000, 1000000, 2500000] }[currency] || [250000, 500000, 1000000, 2500000]);
    levels.forEach((amount) => {
      const value = String(amount);
      const rate = state.mode === "rent" ? ` ${t("perMonth")}` : state.mode === "commercial" ? " / sq.ft / month" : "";
      choices.push([value, `${t("upTo")} ${formatCurrency(amount, currency)}${rate}`]);
    });
  }
  const current = budgetFilter.value;
  budgetFilter.innerHTML = choices.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  budgetFilter.disabled = currency === "all";
  budgetFilter.value = choices.some(([value]) => value === current) ? current : "all";
}

function propertyPriceLabel(listing) {
  if (listing.sourceUrl || activeLocale === "en") return listing.priceLabel;
  const amount = formatCurrency(listing.price, listing.currency, listing.mode === "buy");
  if (listing.mode === "rent") return `${amount} ${t("perMonth")}`;
  if (listing.mode === "commercial") return `${amount} / sq.ft / month`;
  return amount;
}

applyLocale(activeLocale);
updateBudgetOptions();

async function loadListings() {
  const params = new URLSearchParams({ mode: state.mode });
  if (marketCurrency() !== "all") params.set("currency", marketCurrency());
  const query = $("#globalSearch").value.trim();
  const selectedTypes = $$("#typeFilters input:checked").map((input) => input.value);
  if (query) params.set("q", query);
  selectedTypes.forEach((type) => params.append("type", type));
  const maxPrice = budgetFilter.value === "all" ? null : Number(budgetFilter.value);
  if (maxPrice !== null) params.set("maxPrice", String(maxPrice));
  if (state.minBeds > 0) params.set("minBeds", String(state.minBeds));
  const result = await api(`/listings?${params}`);
  state.listings = result.listings;
  renderListings();
  renderMarkers();
  if (!state.selectedId || !state.listings.some((listing) => listing.id === state.selectedId)) {
    selectListing(state.listings[0]?.id || null, false);
  } else {
    renderInspector();
  }
}

function currentListing() {
  return state.listings.find((listing) => listing.id === state.selectedId) || null;
}

function cardMarkup(listing) {
  const isSaved = state.favorites.has(listing.id);
  const bedroomText = listing.beds ? `${listing.beds} bd` : listing.type;
  const areaUnit = listing.areaUnit === "sqm" ? "m²" : "sq.ft";
  const areaLocale = localeTags[activeLocale] || navigator.language || "en";
  const priceLabel = propertyPriceLabel(listing);
  return `<article class="listing-card" data-listing="${escapeHTML(listing.id)}" tabindex="0" aria-label="View ${escapeHTML(listing.title)}">
    <div class="listing-card-image"><img src="${escapeHTML(listing.image)}" alt="${escapeHTML(listing.title)}" loading="lazy"><span class="listing-card-badge">${escapeHTML(listing.type)}</span><button class="listing-save ${isSaved ? "saved" : ""}" type="button" data-favorite="${escapeHTML(listing.id)}" aria-label="${isSaved ? "Remove" : "Save"} ${escapeHTML(listing.title)}" aria-pressed="${isSaved}"><i data-lucide="${isSaved ? "bookmark-check" : "bookmark"}"></i></button></div>
    <div class="listing-card-body"><div class="listing-card-overline"><span>${escapeHTML(listing.location)} · ${escapeHTML(listing.city)}, ${escapeHTML(listing.country)}</span><span>${listing.featured ? "FEATURED" : ""}</span></div><h3>${escapeHTML(listing.title)}</h3><div class="listing-card-location"><i data-lucide="map-pin"></i>${escapeHTML(listing.city)}, ${escapeHTML(listing.country)}</div><div class="listing-trust-label ${listing.sample ? "demo" : "checked"}">${listing.sample ? "Illustrative demo · not a verified offer" : `Checked ${listing.verifiedAt ? new Date(listing.verifiedAt).toLocaleDateString(areaLocale) : "recently"}`}</div><div class="listing-card-footer"><span class="listing-card-price">${escapeHTML(priceLabel)}</span><span class="listing-card-facts"><span><i data-lucide="bed-double"></i>${escapeHTML(bedroomText)}</span><span><i data-lucide="ruler"></i>${listing.area ? `${Number(listing.area).toLocaleString(areaLocale)} ${areaUnit}` : "Area not listed"}</span></span></div></div></article>`;
}

function renderListings() {
  const sorted = [...state.listings];
  if (state.sort === "price-low") sorted.sort((a, b) => a.currency.localeCompare(b.currency) || a.price - b.price);
  else if (state.sort === "price-high") sorted.sort((a, b) => a.currency.localeCompare(b.currency) || b.price - a.price);
  else sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
  state.visibleListings = sorted;
  const grid = $("#listingGrid");
  grid.classList.toggle("list-mode", state.listView);
  grid.innerHTML = sorted.map(cardMarkup).join("");
  $("#resultCount").textContent = `${new Intl.NumberFormat(localeTags[activeLocale]).format(sorted.length)} ${sorted.length === 1 ? t("homeSingular") : t("homePlural")}`;
  $("#emptyState").hidden = sorted.length > 0;
  grid.hidden = sorted.length === 0;
  if (sorted.length) selectListing(state.selectedId && sorted.some((listing) => listing.id === state.selectedId) ? state.selectedId : sorted[0].id, false);
  createIcons({ icons });
}

function renderMarkers() {
  renderPropertyMap();
}

const cityCoordinates = {
  Hyderabad: [17.385, 78.4867], "New York": [40.7128, -74.006], London: [51.5072, -0.1276], Paris: [48.8566, 2.3522], Dubai: [25.2048, 55.2708], Toronto: [43.6532, -79.3832], Sydney: [-33.8688, 151.2093], Singapore: [1.3521, 103.8198], Tokyo: [35.6762, 139.6503], Zurich: [47.3769, 8.5417], "Cape Town": [-33.9249, 18.4241], "São Paulo": [-23.5505, -46.6333], "Mexico City": [19.4326, -99.1332], Auckland: [-36.8509, 174.7645], Berlin: [52.52, 13.405], Barcelona: [41.3874, 2.1686], Rome: [41.9028, 12.4964], Mumbai: [19.076, 72.8777], Delhi: [28.6139, 77.209], Bengaluru: [12.9716, 77.5946], Bangkok: [13.7563, 100.5018], Istanbul: [41.0082, 28.9784], Jakarta: [-6.2088, 106.8456], Riyadh: [24.7136, 46.6753], Seoul: [37.5665, 126.978], Shanghai: [31.2304, 121.4737], Stockholm: [59.3293, 18.0686]
};
function renderPropertyMap() {
  const listing = currentListing();
  const knownCity = cityCoordinates[listing?.city];
  const [lat, lon] = knownCity || [0, 0];
  const destination = listing ? `${listing.city}, ${listing.country}` : "Hyderabad, India";
  if (!knownCity) {
    const searchUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`;
    if ($("#propertyMap").getAttribute("src") !== "about:blank") $("#propertyMap").src = "about:blank";
    $("#mapProviderLink").href = searchUrl;
    $("#mapRegion").textContent = destination;
    $("#mapAccuracyNote").textContent = "No city pin is configured yet. Open the map search to locate this city; directions use the city only.";
    $("#mapAccuracyNote").hidden = false;
    $("#currentLocationDirections").disabled = !listing;
    return;
  }
  const bbox = [lon - 0.06, lat - 0.045, lon + 0.06, lat + 0.045].join(",");
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`;
  if ($("#propertyMap").src !== mapUrl) $("#propertyMap").src = mapUrl;
  const mapLink = new URL("https://www.openstreetmap.org/");
  mapLink.hash = `map=13/${lat}/${lon}`;
  $("#mapProviderLink").href = mapLink.toString();
  $("#mapRegion").textContent = listing ? `${listing.location} · ${destination}` : destination;
  $("#mapAccuracyNote").textContent = "Pin shows the city centre, not the property parcel. In Directions, choose your current location as the start.";
  $("#mapAccuracyNote").hidden = false;
  $("#currentLocationDirections").disabled = !listing;
}

function renderInspector() {
  const listing = currentListing();
  const image = $("#inspectorImage");
  const saveButton = $("#inspectorSave");
  if (!listing) {
    image.removeAttribute("src");
    image.alt = "No property selected";
    $("#inspectorType").textContent = "NEIGHBOURHOOD MAP";
    $("#inspectorTitle").textContent = "Explore the map";
    $("#inspectorPrice").textContent = "—";
    $("#inspectorLocation").textContent = "No homes match these filters";
    $("#inspectorDescription").textContent = "Adjust the search filters to see available properties in the neighbourhood.";
    $("#inspectorSource").hidden = true;
    $("#inspectorStats").replaceChildren();
    saveButton.disabled = true;
    $("#enquireButton").disabled = true;
    return;
  }
  image.src = listing.image;
  image.alt = listing.title;
  $("#inspectorType").textContent = `${listing.mode.toUpperCase()} · ${listing.type.toUpperCase()}${listing.featured ? " · FEATURED" : ""}`;
  $("#inspectorTitle").textContent = listing.title;
  $("#inspectorPrice").textContent = propertyPriceLabel(listing);
  $("#inspectorLocation").textContent = `${listing.location}, ${listing.city}, ${listing.country}`;
  $("#inspectorDescription").textContent = listing.description;
  const sourceLink = $("#inspectorSource");
  sourceLink.hidden = !listing.sourceUrl;
  if (listing.sourceUrl) sourceLink.href = listing.sourceUrl;
  $("#listingDisclaimer").innerHTML = listing.sample
    ? '<i data-lucide="badge-info"></i> Fictional illustrative sample. It is not a real offer.'
    : `<i data-lucide="badge-info"></i> Checked by PropertyHub on ${listing.verifiedAt ? new Date(listing.verifiedAt).toLocaleDateString(localeTags[activeLocale]) : "an unknown date"}. Confirm availability before acting.`;
  const areaUnitLabel = listing.areaUnit === "sqm" ? "M²" : "SQ.FT";
  $("#inspectorStats").innerHTML = `<span class="inspector-stat"><strong>${listing.beds || "—"}</strong>BEDROOMS</span><span class="inspector-stat"><strong>${listing.baths || "—"}</strong>BATHS</span><span class="inspector-stat"><strong>${listing.area ? Number(listing.area).toLocaleString(localeTags[activeLocale]) : "—"}</strong>${listing.area ? areaUnitLabel : "AREA"}</span>`;
  saveButton.classList.toggle("saved", state.favorites.has(listing.id));
  saveButton.setAttribute("aria-pressed", String(state.favorites.has(listing.id)));
  saveButton.setAttribute("aria-label", `${state.favorites.has(listing.id) ? "Remove" : "Save"} ${listing.title}`);
  saveButton.disabled = false;
  $("#enquireButton").disabled = false;
  createIcons({ icons });
}

function selectListing(id, animate = true) {
  state.selectedId = id;
  $$(".listing-card").forEach((card) => card.classList.toggle("selected", card.dataset.listing === id));
  $$(".map-marker").forEach((marker) => marker.classList.toggle("selected", marker.dataset.marker === id));
  renderInspector();
  renderPropertyMap();
  if (animate && window.matchMedia("(max-width: 1040px)").matches) $("#propertyInspector").classList.add("open");
}

function renderFavoriteCount() {
  $("#savedCount").textContent = String(state.favorites.size);
  $("#inspectorSave").classList.toggle("saved", state.favorites.has(state.selectedId));
}

async function toggleFavorite(id) {
  if (!state.user) {
    state.favoriteAfterAuth = id;
    $("#authDialog").showModal();
    setAuthMode("login");
    toast("Sign in to sync saved homes.");
    return;
  }
  const saved = state.favorites.has(id);
  if (saved) {
    await api(`/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.favorites.delete(id);
    toast("Removed from saved homes.");
  } else {
    await api(`/favorites/${encodeURIComponent(id)}`, { method: "PUT" });
    state.favorites.add(id);
    toast("Home added to your saved list.");
  }
  renderListings();
  renderFavoriteCount();
  renderInspector();
  if ($("#savedView").classList.contains("active")) renderSaved();
}

async function loadFavorites() {
  if (!state.user) {
    state.favorites.clear();
    renderFavoriteCount();
    return;
  }
  const response = await api("/favorites");
  state.favorites = new Set(response.favorites.map((listing) => listing.id));
  renderFavoriteCount();
  renderListings();
  renderInspector();
}

function renderSaved() {
  const saved = state.listings.filter((listing) => state.favorites.has(listing.id));
  $("#savedGrid").innerHTML = saved.map(cardMarkup).join("");
  $("#savedGrid").hidden = saved.length === 0;
  $("#savedEmpty").hidden = saved.length > 0;
  createIcons({ icons });
}

async function loadMyInquiries() {
  if (!state.user) {
    $("#inquiriesEmpty").hidden = false;
    $("#myInquiryList").replaceChildren();
    $("#myInquiryList").hidden = true;
    $("#inquiriesEmpty h3").textContent = "Sign in to see your enquiries.";
    $("#inquiriesEmpty p").textContent = "Your private property conversations appear here.";
    return;
  }
  const { inquiries } = await api("/my/inquiries");
  const list = $("#myInquiryList");
  list.innerHTML = inquiries.map((inquiry) => `<article class="inquiry-item"><div class="inquiry-item-header"><h3>${escapeHTML(inquiry.listingTitle || "Property enquiry")}</h3><time>${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(inquiry.createdAt))}</time></div><p>${escapeHTML(inquiry.message)}</p><p class="inquiry-item-meta">${escapeHTML(inquiry.listingLocation || "PropertyHub")}</p></article>`).join("");
  list.hidden = inquiries.length === 0;
  $("#inquiriesEmpty").hidden = inquiries.length > 0;
  $("#inquiriesEmpty h3").textContent = "No enquiries yet.";
  $("#inquiriesEmpty p").textContent = "Your property conversations will appear here.";
}

function setUser(user) {
  state.user = user;
  $("#authOpen").hidden = Boolean(user);
  $("#profileButton").hidden = !user;
  $("#avatarLetter").textContent = user?.name?.trim()?.[0]?.toUpperCase() || "P";
  $("#authOpen").textContent = "Sign in";
  $("#adminNav").hidden = user?.role !== "admin";
  $("#listPropertyButton").hidden = user?.role !== "admin";
  renderFavoriteCount();
  if ($("#savedView").classList.contains("active")) renderSaved();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === "register";
  const requestingReset = mode === "forgot";
  const resettingPassword = mode === "reset";
  $("#authTitle").innerHTML = t(registering ? "authRegisterTitle" : requestingReset ? "authForgotTitle" : resettingPassword ? "authResetTitle" : "authLoginTitle");
  $("#authIntro").textContent = t(registering ? "authRegisterIntro" : requestingReset ? "authForgotIntro" : resettingPassword ? "authResetIntro" : "authLoginIntro");
  $("#nameField").hidden = !registering;
  $("#nameField input").required = registering;
  $("#authEmailField").hidden = resettingPassword;
  $("#authEmailInput").required = !resettingPassword;
  $("#authPasswordField").hidden = requestingReset;
  $("#passwordRules").hidden = !(registering || resettingPassword);
  $("#authForm input[name=password]").required = !requestingReset;
  $("#authForm input[name=password]").autocomplete = registering || resettingPassword ? "new-password" : "current-password";
  $("#authPasswordConfirmField").hidden = !resettingPassword;
  $("#authForm input[name=passwordConfirm]").required = resettingPassword;
  $("#authSubmit").textContent = t(registering ? "createAccount" : requestingReset ? "sendReset" : resettingPassword ? "updatePassword" : "signIn");
  $("#forgotPasswordOpen").hidden = mode !== "login";
  $("#authModeToggle").textContent = t(registering ? "existingAccount" : mode === "login" ? "newAccount" : "backToSignIn");
  $("#authError").hidden = true;
  $("#authStatus").hidden = true;
}

function showView(name) {
  const mappedName = name === "admin" && state.user?.role !== "admin" ? "discover" : name;
  $$(".view-panel").forEach((panel) => {
    const active = panel.id === `${mappedName}View`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === mappedName));
  $("#sidebar").classList.remove("open");
  $("#mobileMenuToggle").setAttribute("aria-expanded", "false");
  if (mappedName === "saved") renderSaved();
  if (mappedName === "inquiries") loadMyInquiries().catch((error) => toast(error.message, true));
  if (mappedName === "admin") loadAdmin().catch((error) => toast(error.message, true));
  window.scrollTo(0, 0);
}

async function loadAdmin() {
  if (state.user?.role !== "admin") return;
  const [stats, inquiries, listingResponse] = await Promise.all([api("/admin/stats"), api("/admin/inquiries"), api("/admin/listings")]);
  $("#adminStats").innerHTML = `<article class="admin-stat"><span>Visible listings (demos included)</span><strong>${stats.listings}</strong></article><article class="admin-stat"><span>Saved enquiries</span><strong>${stats.inquiries}</strong></article><article class="admin-stat"><span>Member accounts</span><strong>${stats.users}</strong></article>`;
  $("#adminInquiryCount").textContent = `${inquiries.inquiries.length} recent`;
  $("#adminInquiryList").innerHTML = inquiries.inquiries.length ? inquiries.inquiries.map((inquiry) => `<article class="admin-inquiry-row"><span>${escapeHTML(inquiry.name)}<small>${escapeHTML(inquiry.email)}</small></span><span>${escapeHTML(inquiry.listingTitle || "Property enquiry")}<small>${escapeHTML(inquiry.listingTitle ? "Listing request" : "General")}</small></span><span>${escapeHTML(inquiry.phone)}<small>${new Date(inquiry.createdAt).toLocaleString()}</small></span><span></span></article>`).join("") : '<p class="admin-empty">No enquiries have arrived yet.</p>';
  $("#adminListingList").innerHTML = listingResponse.listings.map((listing) => {
    const fresh = listing.verifiedAt && Date.now() - Date.parse(listing.verifiedAt) < 30 * 86400000;
    const status = listing.sample ? "Fictional demo" : fresh ? `Checked ${new Date(listing.verifiedAt).toLocaleDateString()}` : "Hidden · needs review";
    const verifyAction = listing.sample ? "" : `<button class="admin-verify" type="button" data-verify-listing="${escapeHTML(listing.id)}">${fresh ? "Refresh check" : "Verify & publish"}</button>`;
    return `<article class="admin-listing-row"><span>${escapeHTML(listing.title)}<small>${escapeHTML(listing.location)}, ${escapeHTML(listing.city)}, ${escapeHTML(listing.country)}</small></span><span>${escapeHTML(listing.mode)} · ${escapeHTML(listing.type)}<small>${escapeHTML(listing.priceLabel)}</small></span><span>${escapeHTML(status)}<small>${Number(listing.area).toLocaleString(navigator.language || "en")} ${listing.areaUnit === "sqm" ? "m²" : "sq.ft"}</small></span><span class="admin-row-actions">${verifyAction}<button class="admin-delete" type="button" data-delete-listing="${escapeHTML(listing.id)}" aria-label="Delete ${escapeHTML(listing.title)}"><i data-lucide="trash-2"></i></button></span></article>`;
  }).join("");
  createIcons({ icons });
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}
$$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$$("[data-toggle-password]").forEach((button) => button.addEventListener("click", () => {
  const input = button.closest(".password-field").querySelector("input");
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  button.setAttribute("aria-pressed", String(visible));
  button.innerHTML = `<i data-lucide="${visible ? "eye-off" : "eye"}"></i>`;
  createIcons({ icons });
}));
$$(".app-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

$("#authOpen").addEventListener("click", () => { setAuthMode("login"); openDialog($("#authDialog")); });
$("#forgotPasswordOpen").addEventListener("click", () => { setAuthMode("forgot"); openDialog($("#authDialog")); });
$("#mobileAccount").addEventListener("click", () => {
  if (state.user) {
    const shouldLogout = window.confirm(`Sign out of ${state.user.email}?`);
    if (shouldLogout) logout();
  } else {
    setAuthMode("login");
    openDialog($("#authDialog"));
  }
});
$("#profileButton").addEventListener("click", () => {
  if (window.confirm(`Sign out of ${state.user?.email || "your account"}?`)) logout();
});
$("#authModeToggle").addEventListener("click", () => {
  if (state.authMode === "login") setAuthMode("register");
  else {
    if (state.authMode === "reset") {
      state.passwordResetToken = null;
      clearPasswordResetHash();
      $("#authForm").reset();
    }
    setAuthMode("login");
  }
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const button = $("#authSubmit");
  const error = $("#authError");
  button.disabled = true;
  error.hidden = true;
  $("#authStatus").hidden = true;
  try {
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    if (state.authMode === "forgot") {
      const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: payload.email }) });
      $("#authStatus").textContent = `${result.message}${result.development ? " For local development, a matching reset link is printed in the API server terminal." : ""}`;
      $("#authStatus").hidden = false;
      return;
    }
    if (state.authMode === "reset") {
      if (payload.password !== payload.passwordConfirm) throw new Error("The passwords do not match.");
      validateNewPassword(payload.password, payload.email);
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: state.passwordResetToken, password: payload.password }) });
      state.passwordResetToken = null;
      clearPasswordResetHash();
      formElement.reset();
      setAuthMode("login");
      $("#authDialog").close();
      toast("Password updated. Sign in with your new password.");
      return;
    }
    if (state.authMode === "register") validateNewPassword(payload.password, `${payload.name} ${payload.email}`);
    const endpoint = state.authMode === "register" ? "/auth/register" : "/auth/login";
    const result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
    setUser(result.user);
    await loadFavorites();
    formElement.reset();
    $("#authDialog").close();
    toast(`Welcome${result.user.name ? `, ${result.user.name.split(" ")[0]}` : " back"}.`);
    if (state.favoriteAfterAuth) {
      const listingId = state.favoriteAfterAuth;
      state.favoriteAfterAuth = null;
      if (!state.favorites.has(listingId)) await toggleFavorite(listingId);
    }
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch (error) { toast(error.message, true); return; }
  setUser(null);
  await loadFavorites();
  showView("discover");
  toast("You have been signed out.");
}

function openInquiry() {
  const listing = currentListing();
  if (!listing) return;
  if (!state.user) {
    toast("Sign in before sending a property enquiry.");
    setAuthMode("login");
    openDialog($("#authDialog"));
    return;
  }
  $("#inquiryProperty").textContent = `${listing.title} · ${listing.location}, ${listing.city}`;
  $("#inquiryForm").dataset.listingId = listing.id;
  $("#inquiryError").hidden = true;
  openDialog($("#inquiryDialog"));
}
$("#enquireButton").addEventListener("click", openInquiry);
$("#copyPropertyLink").addEventListener("click", async () => {
  const listing = currentListing();
  if (!listing) return;
  const url = new URL(window.location.href);
  url.hash = `property-${listing.id}`;
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Property link copied.");
  } catch {
    toast("Clipboard access is unavailable in this browser.", true);
  }
});
$("#inquiryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const error = $("#inquiryError");
  const button = formElement.querySelector("button[type=submit]");
  button.disabled = true;
  error.hidden = true;
  try {
    const payload = Object.fromEntries(new FormData(formElement).entries());
    payload.listingId = formElement.dataset.listingId;
    const result = await api("/inquiries", { method: "POST", body: JSON.stringify(payload) });
    formElement.reset();
    $("#inquiryDialog").close();
    toast(result.delivery === "stored-locally" ? "Enquiry saved to your account." : "Enquiry sent.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

async function publishListing(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const error = $("#listingError");
  const button = formElement.querySelector("button[type=submit]");
  button.disabled = true;
  error.hidden = true;
  try {
    const fields = Object.fromEntries(new FormData(formElement).entries());
    const payload = {
      ...fields,
      sourceUrl: fields.sourceUrl || undefined,
      verified: fields.verified === "on",
      price: Number(fields.price),
      beds: Number(fields.beds),
      baths: Number(fields.baths),
      area: Number(fields.area)
    };
    await api("/admin/listings", { method: "POST", body: JSON.stringify(payload) });
    formElement.reset();
    $("#listingDialog").close();
    toast("Verified listing published.");
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}
function addListingMarketControls() {
  const grid = $("#listingForm .form-grid");
  const countryLabel = document.createElement("label");
  countryLabel.className = "field-label";
  countryLabel.textContent = "Country";
  const countryInput = document.createElement("input");
  countryInput.name = "country";
  countryInput.required = true;
  countryInput.minLength = 2;
  countryInput.maxLength = 80;
  countryInput.autocomplete = "country-name";
  countryInput.value = "India";
  countryInput.defaultValue = "India";
  countryInput.placeholder = "Country or territory";
  countryInput.addEventListener("input", () => { countryInput.dataset.manuallyEdited = "true"; });
  countryLabel.append(countryInput);

  const currencyLabel = document.createElement("label");
  currencyLabel.className = "field-label";
  currencyLabel.textContent = "Listing currency";
  const currencySelect = document.createElement("select");
  currencySelect.name = "currency";
  for (const [code, name] of [["INR", "INR · India"], ["USD", "USD · United States"], ["EUR", "EUR · Eurozone"], ["GBP", "GBP · United Kingdom"], ["AED", "AED · United Arab Emirates"], ["CAD", "CAD · Canada"], ["AUD", "AUD · Australia"], ["SGD", "SGD · Singapore"], ["JPY", "JPY · Japan"], ["CHF", "CHF · Switzerland"]]) {
    currencySelect.add(new Option(name, code));
  }
  currencyLabel.append(currencySelect);
  currencySelect.addEventListener("change", () => {
    const countries = { INR: "India", USD: "United States", EUR: "", GBP: "United Kingdom", AED: "United Arab Emirates", CAD: "Canada", AUD: "Australia", SGD: "Singapore", JPY: "Japan", CHF: "Switzerland" };
    if (countryInput.dataset.manuallyEdited !== "true") countryInput.value = countries[currencySelect.value] || "";
    priceInput.placeholder = `Amount in ${currencySelect.value}`;
  });

  const areaUnitLabel = document.createElement("label");
  areaUnitLabel.className = "field-label";
  areaUnitLabel.textContent = "Area unit";
  const areaUnitSelect = document.createElement("select");
  areaUnitSelect.name = "areaUnit";
  areaUnitSelect.add(new Option("Square feet", "sqft"));
  areaUnitSelect.add(new Option("Square metres", "sqm"));
  areaUnitLabel.append(areaUnitSelect);

  grid.insertBefore(countryLabel, grid.querySelector(".full-field"));
  grid.insertBefore(currencyLabel, grid.querySelector(".full-field"));
  grid.insertBefore(areaUnitLabel, grid.querySelector(".full-field"));
  const cityInput = grid.querySelector('[name="city"]');
  cityInput.value = "";
  cityInput.defaultValue = "";
  cityInput.placeholder = "City or region";
  const priceInput = grid.querySelector('[name="price"]');
  priceInput.closest(".field-label").firstChild.textContent = "Price in selected currency";
  priceInput.placeholder = "Enter full amount, e.g. 850000";
  grid.querySelector('[name="area"]').closest(".field-label").firstChild.textContent = "Area";
}
addListingMarketControls();
$("#listingForm").addEventListener("submit", publishListing);
$("#listPropertyButton").addEventListener("click", () => {
  if (state.user?.role === "admin") openDialog($("#listingDialog"));
  else toast(state.user ? "Admin access is required to publish listings." : "Sign in with an administrator account to publish listings.");
});
$("#adminAddListing").addEventListener("click", () => openDialog($("#listingDialog")));

$("#adminListingList").addEventListener("click", async (event) => {
  const verify = event.target.closest("[data-verify-listing]");
  if (verify) {
    if (!window.confirm("Confirm that you are authorized to publish this listing and have checked its current price and availability.")) return;
    verify.disabled = true;
    try {
      await api(`/admin/listings/${encodeURIComponent(verify.dataset.verifyListing)}/verify`, { method: "POST", body: JSON.stringify({ verified: true }) });
      await loadAdmin();
      toast("Listing check recorded. It will remain public for 30 days.");
    } catch (error) { verify.disabled = false; toast(error.message, true); }
    return;
  }
  const button = event.target.closest("[data-delete-listing]");
  if (!button || !window.confirm("Remove this property from the live map?")) return;
  button.disabled = true;
  try {
    await api(`/admin/listings/${encodeURIComponent(button.dataset.deleteListing)}`, { method: "DELETE" });
    toast("Listing removed.");
  } catch (error) {
    button.disabled = false;
    toast(error.message, true);
  }
});

function applyFilters() {
  state.minBeds = 0;
  updateBudgetOptions();
  loadListings().catch((error) => {
    $("#listingGrid").innerHTML = "";
    $("#resultCount").textContent = "Listings unavailable";
    $("#emptyState").hidden = false;
    $("#emptyState h3").textContent = "We couldn't reach PropertyHub.";
    $("#emptyState p").textContent = error.message;
    toast(error.message, true);
  });
}
$$(".mode-button").forEach((button) => button.addEventListener("click", () => {
  state.mode = button.dataset.mode;
  $$(".mode-button").forEach((tab) => {
    tab.classList.toggle("active", tab === button);
    tab.setAttribute("aria-selected", String(tab === button));
  });
  applyFilters();
}));
currencyFilter.addEventListener("change", () => {
  budgetFilter.value = "all";
  applyFilters();
});
budgetFilter.addEventListener("change", applyFilters);
$$("#typeFilters input").forEach((input) => input.addEventListener("change", applyFilters));
$("#clearFilters").addEventListener("click", () => {
  $("#globalSearch").value = "";
  currencyFilter.value = "all";
  budgetFilter.value = "all";
  $$("#typeFilters input").forEach((input) => { input.checked = false; });
  applyFilters();
});
$("#emptyClear").addEventListener("click", () => $("#clearFilters").click());
let searchTimer;
$("#globalSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 180);
});
$("#sortButton").addEventListener("click", () => {
  const sequence = ["featured", "price-low", "price-high"];
  state.sort = sequence[(sequence.indexOf(state.sort) + 1) % sequence.length];
  const label = { featured: "featured", "price-low": "priceLowToHigh", "price-high": "priceHighToLow" };
  $("#sortButton").innerHTML = `<span>${t(label[state.sort])}</span> <i data-lucide="arrow-down-up"></i>`;
  renderListings();
  createIcons({ icons });
});

$("#listingGrid").addEventListener("click", async (event) => {
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    event.stopPropagation();
    try { await toggleFavorite(favoriteButton.dataset.favorite); } catch (error) { toast(error.message, true); }
    return;
  }
  const card = event.target.closest("[data-listing]");
  if (card) selectListing(card.dataset.listing);
});
$("#savedGrid").addEventListener("click", async (event) => {
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    event.stopPropagation();
    try { await toggleFavorite(favoriteButton.dataset.favorite); } catch (error) { toast(error.message, true); }
    return;
  }
  const card = event.target.closest("[data-listing]");
  if (card) { state.mode = state.listings.find((listing) => listing.id === card.dataset.listing)?.mode || "buy"; await loadListings(); selectListing(card.dataset.listing); showView("discover"); }
});
for (const grid of [$("#listingGrid"), $("#savedGrid")]) {
  grid.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".listing-card")) {
      event.preventDefault();
      selectListing(event.target.dataset.listing);
    }
  });
}
$("#closeInspector").addEventListener("click", () => $("#propertyInspector").classList.remove("open"));
$("#resetMap").addEventListener("click", () => { showView("discover"); $("#sceneFrame").scrollIntoView({ behavior: "smooth", block: "center" }); });
$("#backToDiscover").addEventListener("click", () => { showView("discover"); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("#backToResults").addEventListener("click", () => $("#resultsHeading").scrollIntoView({ behavior: "smooth", block: "start" }));
$("#currentLocationDirections").addEventListener("click", () => openDirections());
function openDirections() {
  const listing = currentListing();
  if (!listing) return toast("Select a property first.", true);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${listing.city}, ${listing.country}`);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
  toast("Set your current location as the starting point in Google Maps.");
}

$("#mapViewToggle").addEventListener("click", () => {
  state.listView = false;
  $("#mapViewToggle").classList.add("active");
  $("#listViewToggle").classList.remove("active");
  $("#discoverView").classList.remove("list-only");
  renderListings();
});
$("#listViewToggle").addEventListener("click", () => {
  state.listView = true;
  $("#listViewToggle").classList.add("active");
  $("#mapViewToggle").classList.remove("active");
  $("#discoverView").classList.add("list-only");
  renderListings();
});

function clearPasswordResetHash() {
  if (window.location.hash.startsWith("#password-reset=")) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}
function openPasswordResetFromHash() {
  const prefix = "#password-reset=";
  if (!window.location.hash.startsWith(prefix)) return false;
  const token = window.location.hash.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    clearPasswordResetHash();
    toast("This password reset link is invalid. Request a new one.", true);
    return true;
  }
  state.passwordResetToken = token;
  setAuthMode("reset");
  openDialog($("#authDialog"));
  return true;
}
$("#authDialog").addEventListener("close", () => {
  if (state.authMode === "reset") {
    state.passwordResetToken = null;
    clearPasswordResetHash();
    $("#authForm").reset();
    setAuthMode("login");
  }
});

function validateNewPassword(password, personalInfo = "") {
  const lower = password.toLowerCase();
  const commonWords = ["password", "passw0rd", "qwerty", "letmein", "welcome", "admin", "iloveyou"];
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Use uppercase and lowercase letters, at least one number, and one symbol.");
  }
  if (commonWords.some((word) => lower.includes(word)) || /0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210|abcd|bcde|cdef|defg|efgh|qwer|asdf/i.test(password)) {
    throw new Error("Avoid common passwords and predictable sequences such as 1234 or abcd.");
  }
  const personalParts = personalInfo.toLowerCase().split(/[\s@._+-]+/).filter((part) => part.length >= 3);
  if (personalParts.some((part) => lower.includes(part))) throw new Error("Your password cannot include your name or email address.");
}
$$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
window.addEventListener("hashchange", () => {
  if (openPasswordResetFromHash()) return;
  const id = window.location.hash.startsWith("#property-") ? window.location.hash.slice("#property-".length) : "";
  if (id && state.listings.some((listing) => listing.id === id)) selectListing(id);
});
$("#backToTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
const progressBar = $("#appScrollProgress");
const backToTop = $("#backToTop");
function updateScrollControls() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.transform = `scaleX(${scrollable > 0 ? window.scrollY / scrollable : 0})`;
  backToTop.classList.toggle("visible", window.scrollY > 420);
}
window.addEventListener("scroll", updateScrollControls, { passive: true });
window.addEventListener("resize", updateScrollControls, { passive: true });
$("#savedSignIn").addEventListener("click", () => { setAuthMode("login"); openDialog($("#authDialog")); });
$("#mobileMenuToggle").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#mobileMenuToggle").setAttribute("aria-expanded", String(open));
  $("#mobileMenuToggle").setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
});
document.addEventListener("click", (event) => {
  if (window.innerWidth <= 760 && $("#sidebar").classList.contains("open") && !event.target.closest("#sidebar") && !event.target.closest("#mobileMenuToggle")) {
    $("#sidebar").classList.remove("open");
    $("#mobileMenuToggle").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#globalSearch").focus();
  }
  if (event.key === "Escape") {
    $("#propertyInspector").classList.remove("open");
    $("#sidebar").classList.remove("open");
  }
});
$("#themeToggle").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("propertyhub_theme", theme); } catch {}
});

socket.on("connect", () => setLiveStatus("connected", "Live updates"));
socket.on("disconnect", () => setLiveStatus("offline", "Reconnecting"));
socket.on("connect_error", () => setLiveStatus("offline", "Offline"));
socket.on("listings:changed", async (event) => {
  await loadListings();
  if (state.user?.role === "admin" && $("#adminView").classList.contains("active")) loadAdmin().catch(() => {});
  toast(event.action === "created" ? "A new home was added to the live map." : event.action === "deleted" ? "A home was removed from the map." : "A home listing was updated.");
});
socket.on("inquiries:new", () => {
  if (state.user?.role === "admin" && $("#adminView").classList.contains("active")) loadAdmin().catch(() => {});
});

async function initialize() {
  updateBudgetOptions();
  openPasswordResetFromHash();
  renderPropertyMap();
  try {
    const [{ user }, listingResult] = await Promise.all([api("/auth/me"), api("/listings?mode=buy")]);
    setUser(user);
    state.listings = listingResult.listings;
    renderListings();
    renderMarkers();
    const sharedListing = location.hash.startsWith("#property-") ? location.hash.slice("#property-".length) : "";
    selectListing(state.listings.some((listing) => listing.id === sharedListing) ? sharedListing : state.listings[0]?.id || null, false);
    if (user) await loadFavorites();
    updateScrollControls();
  } catch (error) {
    $("#listingGrid").innerHTML = "";
    $("#resultCount").textContent = "Listings unavailable";
    $("#emptyState").hidden = false;
    $("#emptyState h3").textContent = "We couldn't reach PropertyHub.";
    $("#emptyState p").textContent = error.message;
    toast(error.message, true);
  }
}

initialize();
