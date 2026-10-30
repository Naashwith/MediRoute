const STORAGE_KEY = "medirouteHospitals";
const CURRENT_KEY = "medirouteCurrentHospital";
const views = ["homeView", "registerView", "loginView", "dashboardView", "updateView"];
let toastTimer;

function showView(id) {
  views.forEach(viewId => {
    document.getElementById(viewId).classList.toggle("hidden", viewId !== id);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getHospitals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHospitals(hospitals) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hospitals));
}

function currentHospital() {
  const id = localStorage.getItem(CURRENT_KEY);
  return getHospitals().find(hospital => hospital.id === id) || null;
}

function setCurrent(id) {
  localStorage.setItem(CURRENT_KEY, id);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function formObject(form) {
  const data = {};
  const fd = new FormData(form);
  const arrayFields = ["specialties", "services", "equipment", "bloodGroups"];

  for (const [key, value] of fd.entries()) {
    if (arrayFields.includes(key)) {
      if (!data[key]) data[key] = [];
      data[key].push(value);
    } else {
      data[key] = value;
    }
  }

  form.querySelectorAll('input[type="number"]').forEach(input => {
    data[input.name] = Number(input.value || 0);
  });

  data.specialties ||= [];
  data.services ||= [];
  data.equipment ||= [];
  data.bloodGroups ||= [];

  data.rareBloodGroups = String(data.rareBloodGroups || "").trim();

  return data;
}

function fillForm(form, hospital) {
  for (const [key, value] of Object.entries(hospital)) {
    if (["id", "username", "password", "createdAt", "updatedAt"].includes(key)) {
      continue;
    }

    const controls = form.querySelectorAll(`[name="${CSS.escape(key)}"]`);

    controls.forEach(control => {
      if (control.type === "checkbox") {
        control.checked = Array.isArray(value) && value.includes(control.value);
      } else if (control.type !== "password" && control.name !== "confirmPassword") {
        control.value = value ?? "";
      }
    });
  }
}

function validateResources(data) {
  const numericKeys = [
    "totalBeds",
    "availableBeds",
    "occupiedBeds",
    "reservedBeds",
    "icuBeds",
    "emergencyBeds",
    "traumaBeds",
    "isolationBeds"
  ];

  for (const key of numericKeys) {
    if (Number(data[key] || 0) < 0) {
      return "Resource counts cannot be negative.";
    }
  }

  if (Number(data.availableBeds || 0) > Number(data.totalBeds || 0)) {
    return "Available beds cannot exceed total beds.";
  }

  if (
    Number(data.occupiedBeds || 0) +
    Number(data.reservedBeds || 0) +
    Number(data.availableBeds || 0) >
    Number(data.totalBeds || 0)
  ) {
    return "Available, occupied, and reserved beds together cannot exceed total beds.";
  }

  return "";
}

function setMessage(id, message) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function displayValue(value) {
  return value === "" || value == null
    ? "Not provided"
    : escapeHtml(value);
}

document.getElementById("brandHome").addEventListener("click", event => {
  event.preventDefault();
  showView("homeView");
});

document.getElementById("goRegister").addEventListener("click", () => {
  document.getElementById("registerForm").reset();
  setMessage("registerError", "");
  showView("registerView");
});

document.getElementById("goLogin").addEventListener("click", () => {
  document.getElementById("loginForm").reset();
  setMessage("loginError", "");
  showView("loginView");
});

document.getElementById("loginRegister").addEventListener("click", () => {
  setMessage("registerError", "");
  showView("registerView");
});

document.querySelectorAll("[data-home]").forEach(button => {
  button.addEventListener("click", () => showView("homeView"));
});

document.getElementById("registerForm").addEventListener("submit", event => {
  event.preventDefault();
  setMessage("registerError", "");

  const form = event.currentTarget;
  const data = formObject(form);
  const password = form.elements.password.value;
  const confirmPassword = form.elements.confirmPassword.value;

  if (password !== confirmPassword) {
    return setMessage("registerError", "Passwords do not match.");
  }

  const resourceError = validateResources(data);

  if (resourceError) {
    return setMessage("registerError", resourceError);
  }

  const hospitals = getHospitals();
  const username = data.username.trim().toLowerCase();

  if (hospitals.some(h => h.username.toLowerCase() === username)) {
    return setMessage(
      "registerError",
      "That username is already registered. Please log in or use another username."
    );
  }

  if (hospitals.some(h => h.email.toLowerCase() === data.email.toLowerCase())) {
    return setMessage(
      "registerError",
      "That hospital email is already registered."
    );
  }

  const hospital = {
    ...data,
    id: window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2),
    username,
    password,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  hospitals.push(hospital);
  saveHospitals(hospitals);
  setCurrent(hospital.id);

  form.reset();
  renderDashboard();
  showView("dashboardView");
  showToast("Hospital registered successfully.");
});

document.getElementById("loginForm").addEventListener("submit", event => {
  event.preventDefault();
  setMessage("loginError", "");

  const username = event.currentTarget.elements.username.value
    .trim()
    .toLowerCase();

  const password = event.currentTarget.elements.password.value;

  const hospital = getHospitals().find(h =>
    (h.username.toLowerCase() === username ||
      h.email.toLowerCase() === username) &&
    h.password === password
  );

  if (!hospital) {
    return setMessage(
      "loginError",
      "Invalid username/email or password. Please try again."
    );
  }

  setCurrent(hospital.id);
  renderDashboard();
  showView("dashboardView");
  showToast("Login successful.");
});

function detail(label, value) {
  return `<div class="detail-item">
    <small>${escapeHtml(label)}</small>
    <span>${displayValue(value)}</span>
  </div>`;
}

function resourceRow(label, value) {
  return `<div class="resource-row">
    <span>${escapeHtml(label)}</span>
    <strong>${displayValue(value)}</strong>
  </div>`;
}

function renderDashboard() {
  const h = currentHospital();

  if (!h) {
    showView("homeView");
    return;
  }

  document.getElementById("dashboardName").textContent =
    h.hospitalName || "Hospital Dashboard";

  document.getElementById("dashboardLocation").textContent =
    [h.address, h.city, h.state, h.pin].filter(Boolean).join(", ");

  document.getElementById("statTotalBeds").textContent =
    h.totalBeds ?? 0;

  document.getElementById("statAvailableBeds").textContent =
    h.availableBeds ?? 0;

  document.getElementById("profileDetails").innerHTML = [
    detail("Hospital contact", h.contactName),
    detail("Phone", h.phone),
    detail("Email", h.email),
    detail("Registration number", h.license),
    detail(
      "Address",
      [h.address, h.city, h.state, h.pin].filter(Boolean).join(", ")
    ),
    detail("Emergency contact", h.emergencyPhone)
  ].join("");

  document.getElementById("bedDetails").innerHTML = [
    resourceRow("Available beds", h.availableBeds ?? 0),
    resourceRow("Occupied beds", h.occupiedBeds ?? 0),
    resourceRow("Reserved beds", h.reservedBeds ?? 0),
    resourceRow("ICU beds", h.icuBeds ?? 0),
    resourceRow("Emergency beds", h.emergencyBeds ?? 0),
    resourceRow("Trauma beds", h.traumaBeds ?? 0),
    resourceRow("Isolation beds", h.isolationBeds ?? 0)
  ].join("");

  const specialtyText =
    (h.specialties || []).join(", ") || "None selected";

  document.getElementById("doctorDetailsView").innerHTML = [
    resourceRow("Specialties", specialtyText),
    resourceRow("Doctor notes", h.doctorDetails || "No details entered")
  ].join("");

  const equipment = h.equipment || [];

  document.getElementById("equipmentDetailsView").innerHTML =
    (equipment.length
      ? equipment.map(item => resourceRow(item, "Available")).join("")
      : resourceRow("Equipment", "None selected")) +
    resourceRow("Other equipment", h.otherEquipment || "None listed");

  const bloodGroups = h.bloodGroups || [];

  const rareBloodGroups = String(h.rareBloodGroups || "")
    .split(",")
    .map(group => group.trim())
    .filter(Boolean);

  const allBloodGroups = [...bloodGroups, ...rareBloodGroups];

  document.getElementById("bloodGroupsDetailsView").innerHTML =
    allBloodGroups.length
      ? allBloodGroups.map(group =>
          `<span class="service-chip">${escapeHtml(group)}</span>`
        ).join("")
      : '<span class="service-chip empty-chip">No blood groups selected</span>';

  const services = h.services || [];

  document.getElementById("servicesDetailsView").innerHTML =
    services.length
      ? services.map(service =>
          `<span class="service-chip">${escapeHtml(service)}</span>`
        ).join("")
      : '<span class="service-chip empty-chip">No services selected</span>';

  document.getElementById("lastUpdated").textContent =
    "Last updated: " +
    new Date(h.updatedAt || h.createdAt).toLocaleString();
}

function openUpdate() {
  const h = currentHospital();

  if (!h) {
    showView("homeView");
    return;
  }

  fillForm(document.getElementById("updateForm"), h);
  setMessage("updateError", "");
  showView("updateView");
}

document.getElementById("updateButton").addEventListener("click", openUpdate);
document.getElementById("profileEdit").addEventListener("click", openUpdate);

document.getElementById("cancelUpdate").addEventListener("click", () => {
  renderDashboard();
  showView("dashboardView");
});

document.getElementById("cancelUpdateTop").addEventListener("click", () => {
  renderDashboard();
  showView("dashboardView");
});

document.getElementById("updateForm").addEventListener("submit", event => {
  event.preventDefault();
  setMessage("updateError", "");

  const form = event.currentTarget;
  const data = formObject(form);
  const error = validateResources(data);

  if (error) {
    return setMessage("updateError", error);
  }

  const h = currentHospital();

  if (!h) {
    showView("homeView");
    return;
  }

  const hospitals = getHospitals();
  const index = hospitals.findIndex(item => item.id === h.id);

  if (index < 0) {
    setMessage(
      "updateError",
      "Hospital record could not be found. Please log in again."
    );
    return;
  }

  data.id = h.id;
  data.username = h.username;
  data.password = h.password;
  data.createdAt = h.createdAt;
  data.updatedAt = new Date().toISOString();

  hospitals[index] = data;
  saveHospitals(hospitals);

  renderDashboard();
  showView("dashboardView");
  showToast("Hospital details updated successfully.");
});

document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem(CURRENT_KEY);
  document.getElementById("loginForm").reset();
  showView("homeView");
  showToast("You have been logged out.");
});

const signedIn = currentHospital();

if (signedIn) {
  renderDashboard();
  showView("dashboardView");
} else {
  showView("homeView");
}

// Interactive hospital location picker for registration and profile updates.
(function initHospitalLocationPickers(){
  if (!window.L) return;
  const configs = [
    {prefix:"register", mapId:"registerHospitalMap", searchId:"registerMapSearch", searchBtn:"registerMapSearchBtn", locateBtn:"registerUseLocation", statusId:"registerMapStatus", latId:"registerLatitude", lngId:"registerLongitude", formId:"registerForm"},
    {prefix:"update", mapId:"updateHospitalMap", searchId:"updateMapSearch", searchBtn:"updateMapSearchBtn", locateBtn:"updateUseLocation", statusId:"updateMapStatus", latId:"updateLatitude", lngId:"updateLongitude", formId:"updateForm"}
  ];
  const maps = {};
  function setPoint(cfg, map, lat, lng, label){
    const point=[lat,lng];
    if(!maps[cfg.prefix].marker) maps[cfg.prefix].marker=L.marker(point,{draggable:true}).addTo(map);
    else maps[cfg.prefix].marker.setLatLng(point);
    document.getElementById(cfg.latId).value=Number(lat).toFixed(7);
    document.getElementById(cfg.lngId).value=Number(lng).toFixed(7);
    document.getElementById(cfg.statusId).textContent=label || `Selected coordinates: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    maps[cfg.prefix].marker.off("dragend").on("dragend",()=>{const p=maps[cfg.prefix].marker.getLatLng();setPoint(cfg,map,p.lat,p.lng);});
  }
  async function reverseAddress(lat,lng,cfg){
    try{const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);if(!res.ok)throw new Error();const data=await res.json();if(data.display_name){const form=document.getElementById(cfg.formId);form.elements.address.value=data.display_name;document.getElementById(cfg.searchId).value=data.display_name;}}catch(e){/* Coordinates remain saved even if reverse geocoding is unavailable. */}
  }
  configs.forEach(cfg=>{
    const el=document.getElementById(cfg.mapId);if(!el)return;
    const map=L.map(el,{scrollWheelZoom:true}).setView([17.9784,79.5941],13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    maps[cfg.prefix]={map,marker:null};
    map.on("click",async e=>{setPoint(cfg,map,e.latlng.lat,e.latlng.lng);await reverseAddress(e.latlng.lat,e.latlng.lng,cfg);});
    document.getElementById(cfg.searchBtn).addEventListener("click",async()=>{
      const query=document.getElementById(cfg.searchId).value.trim();if(!query){document.getElementById(cfg.statusId).textContent="Enter an address or landmark to search.";return;}
      const status=document.getElementById(cfg.statusId);status.textContent="Searching address…";
      try{const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);if(!res.ok)throw new Error();const results=await res.json();if(!results.length)throw new Error("No matching address found.");const p=results[0];map.setView([Number(p.lat),Number(p.lon)],16);setPoint(cfg,map,p.lat,p.lon,"Address found. Adjust the marker if needed.");}
      catch(err){status.textContent=err.message||"Address search failed. Try another address or select directly on the map.";}
    });
    document.getElementById(cfg.locateBtn).addEventListener("click",()=>{if(!navigator.geolocation){document.getElementById(cfg.statusId).textContent="Geolocation is not supported by this browser.";return;}document.getElementById(cfg.statusId).textContent="Getting your current location…";navigator.geolocation.getCurrentPosition(async pos=>{const {latitude,longitude}=pos.coords;map.setView([latitude,longitude],17);setPoint(cfg,map,latitude,longitude,"Current location selected.");await reverseAddress(latitude,longitude,cfg);},()=>{document.getElementById(cfg.statusId).textContent="Could not access location. Allow location permission or select the map manually.";},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});});
  });
  // Refresh Leaflet dimensions whenever either hidden form panel becomes visible.
  function refreshMapSizes(){
    setTimeout(()=>{
      configs.forEach(cfg=>{
        const panel=cfg.prefix==="register"?document.getElementById("registerView"):document.getElementById("updateView");
        if(maps[cfg.prefix] && panel && !panel.classList.contains("hidden")) maps[cfg.prefix].map.invalidateSize(true);
      });
    },250);
  }
  const observer=new MutationObserver(refreshMapSizes);
  ["registerView","updateView"].forEach(id=>{
    const panel=document.getElementById(id);
    if(panel) observer.observe(panel,{attributes:true,attributeFilter:["class"]});
  });
  document.getElementById("goRegister")?.addEventListener("click",refreshMapSizes);
  document.getElementById("loginRegister")?.addEventListener("click",refreshMapSizes);
  refreshMapSizes();
})();
