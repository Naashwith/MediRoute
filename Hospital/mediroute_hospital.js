const STORAGE_KEY = "medirouteHospitals";
const CURRENT_KEY = "medirouteCurrentHospital";
const views = ["homeView", "registerView", "loginView", "dashboardView", "updateView"];
let toastTimer;

function showView(id) {
  views.forEach(viewId => document.getElementById(viewId).classList.toggle("hidden", viewId !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function getHospitals() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveHospitals(hospitals) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hospitals));
}
function currentHospital() {
  const id = localStorage.getItem(CURRENT_KEY);
  return getHospitals().find(hospital => hospital.id === id) || null;
}
function setCurrent(id) { localStorage.setItem(CURRENT_KEY, id); }
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
  for (const [key, value] of fd.entries()) {
    if (key === "specialties" || key === "services") {
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
  return data;
}
function fillForm(form, hospital) {
  for (const [key, value] of Object.entries(hospital)) {
    if (["id", "username", "password", "createdAt", "updatedAt"].includes(key)) continue;
    const controls = form.querySelectorAll(`[name="${CSS.escape(key)}"]`);
    controls.forEach(control => {
      if (control.type === "checkbox") control.checked = Array.isArray(value) && value.includes(control.value);
      else if (control.type !== "password" && control.name !== "confirmPassword") control.value = value ?? "";
    });
  }
}
function validateResources(data) {
  const numericKeys = ["totalBeds","availableBeds","occupiedBeds","reservedBeds","icuBeds","emergencyBeds","traumaBeds","isolationBeds","doctors","doctorsAvailable","receivingCapacity"];
  for (const key of numericKeys) {
    if (Number(data[key] || 0) < 0) return "Resource counts cannot be negative.";
  }
  if (Number(data.availableBeds || 0) > Number(data.totalBeds || 0)) return "Available beds cannot exceed total beds.";
  if (Number(data.occupiedBeds || 0) + Number(data.reservedBeds || 0) + Number(data.availableBeds || 0) > Number(data.totalBeds || 0)) {
    return "Available, occupied, and reserved beds together cannot exceed total beds.";
  }
  if (Number(data.doctorsAvailable || 0) > Number(data.doctors || 0)) return "Available doctors cannot exceed total doctors.";
  return "";
}
function setMessage(id, message) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function displayValue(value) { return value === "" || value == null ? "Not provided" : escapeHtml(value); }

document.getElementById("brandHome").addEventListener("click", event => { event.preventDefault(); showView("homeView"); });
document.getElementById("goRegister").addEventListener("click", () => { document.getElementById("registerForm").reset(); setMessage("registerError", ""); showView("registerView"); });
document.getElementById("goLogin").addEventListener("click", () => { document.getElementById("loginForm").reset(); setMessage("loginError", ""); showView("loginView"); });
document.getElementById("loginRegister").addEventListener("click", () => { setMessage("registerError", ""); showView("registerView"); });
document.querySelectorAll("[data-home]").forEach(button => button.addEventListener("click", () => showView("homeView")));

document.getElementById("registerForm").addEventListener("submit", event => {
  event.preventDefault();
  setMessage("registerError", "");
  const form = event.currentTarget;
  const data = formObject(form);
  const password = form.elements.password.value;
  const confirmPassword = form.elements.confirmPassword.value;
  if (password !== confirmPassword) return setMessage("registerError", "Passwords do not match.");
  const resourceError = validateResources(data);
  if (resourceError) return setMessage("registerError", resourceError);
  const hospitals = getHospitals();
  const username = data.username.trim().toLowerCase();
  if (hospitals.some(h => h.username.toLowerCase() === username)) return setMessage("registerError", "That username is already registered. Please log in or use another username.");
  if (hospitals.some(h => h.email.toLowerCase() === data.email.toLowerCase())) return setMessage("registerError", "That hospital email is already registered.");
  const hospital = {
    ...data,
    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
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
  const username = event.currentTarget.elements.username.value.trim().toLowerCase();
  const password = event.currentTarget.elements.password.value;
  const hospital = getHospitals().find(h => (h.username.toLowerCase() === username || h.email.toLowerCase() === username) && h.password === password);
  if (!hospital) return setMessage("loginError", "Invalid username/email or password. Please try again.");
  setCurrent(hospital.id);
  renderDashboard();
  showView("dashboardView");
  showToast("Login successful.");
});

function detail(label, value) {
  return `<div class="detail-item"><small>${escapeHtml(label)}</small><span>${displayValue(value)}</span></div>`;
}
function resourceRow(label, value) {
  return `<div class="resource-row"><span>${escapeHtml(label)}</span><strong>${displayValue(value)}</strong></div>`;
}
function renderDashboard() {
  const h = currentHospital();
  if (!h) { showView("homeView"); return; }
  document.getElementById("dashboardName").textContent = h.hospitalName || "Hospital Dashboard";
  document.getElementById("dashboardLocation").textContent = [h.address, h.city, h.state, h.pin].filter(Boolean).join(", ");
  document.getElementById("statTotalBeds").textContent = h.totalBeds ?? 0;
  document.getElementById("statAvailableBeds").textContent = h.availableBeds ?? 0;
  document.getElementById("statDoctors").textContent = h.doctorsAvailable ?? 0;
  document.getElementById("statCapacity").textContent = h.receivingCapacity ?? 0;
  document.getElementById("profileDetails").innerHTML = [
    detail("Hospital contact", h.contactName),
    detail("Phone", h.phone),
    detail("Email", h.email),
    detail("Registration number", h.license),
    detail("Address", [h.address,h.city,h.state,h.pin].filter(Boolean).join(", ")),
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
  const specialtyText = (h.specialties || []).join(", ") || "None selected";
  document.getElementById("doctorDetailsView").innerHTML = [
    resourceRow("Specialties", specialtyText),
    resourceRow("Total doctors", h.doctors ?? 0),
    resourceRow("Doctors available", h.doctorsAvailable ?? 0),
    resourceRow("24/7 specialists", h.specialist247 || "No"),
    resourceRow("Doctor notes", h.doctorDetails || "No details entered")
  ].join("");
  const equipment = [
    ["Ventilators",h.ventilators],["Defibrillators",h.defibrillators],["Oxygen units",h.oxygen],
    ["ECG machines",h.ecg],["Patient monitors",h.monitors],["X-ray machines",h.xray],
    ["CT scanners",h.ct],["MRI scanners",h.mri],["Operation theatres",h.theatres],["Blood bank units / capacity",h.bloodBank]
  ];
  document.getElementById("equipmentDetailsView").innerHTML = equipment.map(([label,value]) => resourceRow(label,value ?? 0)).join("") +
    resourceRow("Other equipment", h.otherEquipment || "None listed");
  const services = h.services || [];
  document.getElementById("servicesDetailsView").innerHTML = services.length
    ? services.map(service => `<span class="service-chip">${escapeHtml(service)}</span>`).join("")
    : '<span class="service-chip empty-chip">No services selected</span>';
  document.getElementById("lastUpdated").textContent = "Last updated: " + new Date(h.updatedAt || h.createdAt).toLocaleString();
}
function openUpdate() {
  const h = currentHospital();
  if (!h) return showView("homeView");
  fillForm(document.getElementById("updateForm"), h);
  setMessage("updateError", "");
  showView("updateView");
}
document.getElementById("updateButton").addEventListener("click", openUpdate);
document.getElementById("profileEdit").addEventListener("click", openUpdate);
document.getElementById("cancelUpdate").addEventListener("click", () => { renderDashboard(); showView("dashboardView"); });
document.getElementById("cancelUpdateTop").addEventListener("click", () => { renderDashboard(); showView("dashboardView"); });

document.getElementById("updateForm").addEventListener("submit", event => {
  event.preventDefault();
  setMessage("updateError", "");
  const form = event.currentTarget;
  const data = formObject(form);
  const error = validateResources(data);
  if (error) return setMessage("updateError", error);
  const h = currentHospital();
  if (!h) { showView("homeView"); return; }
  const hospitals = getHospitals();
  const index = hospitals.findIndex(item => item.id === h.id);
  if (index < 0) { setMessage("updateError", "Hospital record could not be found. Please log in again."); return; }
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
if (signedIn) { renderDashboard(); showView("dashboardView"); }
else showView("homeView");
