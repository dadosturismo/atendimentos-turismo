const GAS_URL = "https://script.google.com/macros/s/AKfycbzB6GSofhvuFJhuml3XjhSjb1z8nmAogVMSnEVC58LWhdm1giwMrQ9ZLHLfGmKbrGAb/exec";
const DB_NAME = "turismo-atendimentos-v3";
const QUEUE_STORE = "pendentes";
const OPTIONS_STORE = "opcoes";
const PREFERENCES_STORE = "preferencias";
const $ = (id) => document.getElementById(id);

let options;
let syncing = false;
let savedAttraction = "";
let retryTimer;

const db = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 3);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(QUEUE_STORE)) database.createObjectStore(QUEUE_STORE, { keyPath: "idEnvio" });
    if (!database.objectStoreNames.contains(OPTIONS_STORE)) database.createObjectStore(OPTIONS_STORE);
    if (!database.objectStoreNames.contains(PREFERENCES_STORE)) database.createObjectStore(PREFERENCES_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function readValue(storeName, key) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeValue(storeName, value, key) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function pendingRecords() {
  const database = await db;
  return new Promise((resolve, reject) => {
    const request = database.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function removePending(id) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE, "readwrite");
    transaction.objectStore(QUEUE_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function setMessage(text = "", isError = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", isError);
}

function currentAttraction() {
  return options?.atrativos?.[$("attraction").value];
}

function populateSelect(element, values, placeholder) {
  element.replaceChildren(new Option(placeholder, ""));
  values.forEach((value) => element.add(new Option(value, value)));
}

function populateInformation(config) {
  const select = $("information");
  select.replaceChildren(new Option("Selecione a informação", ""));
  [["Principais", config.principais], ["Outros", config.outros]].forEach(([label, values]) => {
    const group = document.createElement("optgroup");
    group.label = label;
    values.forEach((value) => group.append(new Option(value, value)));
    select.append(group);
  });
}

function populateCountries(filter = "") {
  const selectedCountry = $("country").value;
  const text = normalize(filter);
  const countries = (options?.paises || []).filter((country) => normalize(country).includes(text));
  populateSelect($("country"), countries, countries.length ? "Selecione o país" : "Nenhum país encontrado");
  if (countries.includes(selectedCountry)) $("country").value = selectedCountry;
}

function show(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function lockName() {
  const name = $("name");
  if (!name.value.trim()) return;
  name.readOnly = true;
  name.classList.add("saved");
  writeValue(PREFERENCES_STORE, name.value.trim(), "nome");
}

function unlockName() {
  $("name").readOnly = false;
  $("name").classList.remove("saved");
}

function configureOrigin() {
  const type = selected("attendanceType");
  const nationality = selected("nationality");
  const cityRegion = type === "Curitiba e Região Metropolitana";
  const visitor = type === "Visitante";
  const brazilian = nationality === "Brasileiro";
  const foreign = nationality === "Estrangeiro";

  show($("nationalityField"), visitor);
  show($("originFields"), visitor && Boolean(nationality));
  show($("automaticOrigin"), cityRegion);

  if (cityRegion) {
    document.querySelector('input[name="nationality"][value="Brasileiro"]').checked = true;
    $("country").value = "Brasil";
    $("state").value = "Paraná";
    $("automaticOrigin").textContent = "Origem definida automaticamente: Brasil · Paraná.";
  }

  show($("countrySearch"), foreign);
  show($("stateField"), cityRegion || brazilian);
  show($("countryField"), visitor);

  $("country").disabled = !visitor || !nationality || brazilian;
  $("state").disabled = !(cityRegion || brazilian);

  if (brazilian) $("country").value = "Brasil";
  if (!visitor) {
    $("countrySearch").value = "";
    $("country").value = "";
    $("state").value = "";
  }
  if (foreign) $("state").value = "";
}

function configureAttraction() {
  const config = currentAttraction();
  if (!config) {
    $("information").disabled = true;
    updateSaveButton();
    return;
  }

  $("attraction").disabled = true;
  show($("changeAttraction"), true);
  populateInformation(config);
  $("information").disabled = false;
  show($("groupField"), config.permiteGrupo);
  $("groupSize").required = config.permiteGrupo;
  savedAttraction = $("attraction").value;
  writeValue(PREFERENCES_STORE, $("attraction").value, "atrativo");
  configureOrigin();
  updateSaveButton();
}

function renderOptions() {
  if (!options) return;
  const attractionToRestore = $("attraction").value || savedAttraction;
  populateSelect($("attraction"), Object.keys(options.atrativos), "Selecione o atrativo");
  populateSelect($("state"), options.estados, "Selecione o estado");
  populateCountries();
  $("attraction").disabled = false;

  if (options.atrativos[attractionToRestore]) {
    $("attraction").value = attractionToRestore;
    configureAttraction();
  }
}

function updateSaveButton() {
  const config = currentAttraction();
  const type = selected("attendanceType");
  const nationality = selected("nationality");
  const cityRegion = type === "Curitiba e Região Metropolitana";
  const brazilian = nationality === "Brasileiro";
  const needsState = cityRegion || brazilian;
  const groupSize = Number($("groupSize").value);
  const ready = Boolean(
    config &&
    $("name").value.trim() &&
    type &&
    (cityRegion || nationality) &&
    $("country").value &&
    (!needsState || $("state").value) &&
    $("information").value &&
    ($("information").value !== "Outros" || $("otherInformation").value.trim()) &&
    (!config.permiteGrupo || (Number.isInteger(groupSize) && groupSize >= 1 && groupSize <= 100))
  );
  $("save").disabled = !ready;
}

function encodePayload(data) {
  let binary = "";
  new TextEncoder().encode(JSON.stringify(data)).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function rpc(action, payload) {
  return new Promise((resolve, reject) => {
    if (!navigator.onLine) return reject(new Error("Sem conexão."));
    const nonce = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const timeout = setTimeout(() => cleanup(new Error("O servidor não respondeu.")), 30000);

    function receive(event) {
      const response = event.data?.resposta;
      if (event.data?.tipo !== "atendimento-pwa" || response?.nonce !== nonce) return;
      cleanup();
      response.sucesso ? resolve(response) : reject(new Error(response.erro || "Falha no servidor."));
    }

    function cleanup(error) {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (error) reject(error);
    }

    window.addEventListener("message", receive);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = GAS_URL;
    form.target = "bridge";
    [["action", action], ["payload", encodePayload(payload || {})], ["origin", location.origin], ["nonce", nonce]].forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    });
    document.body.append(form);
    form.submit();
    form.remove();
  });
}

async function refreshOptions() {
  try {
    options = (await rpc("opcoes", {})).opcoes;
    await writeValue(OPTIONS_STORE, options, "atual");
    renderOptions();
  } catch (error) {
    if (!options) setMessage("Sem opções locais. Conecte este dispositivo uma vez à internet.", true);
  }
}

async function updateStatus() {
  const pending = await pendingRecords();
  const online = navigator.onLine;
  $("network").textContent = online ? "● Online" : "● Offline";
  $("network").className = online ? "online" : "offline";
  $("syncSummary").textContent = pending.length
    ? `${pending.length} atendimento(s) aguardando sincronização`
    : "Todos os atendimentos foram sincronizados";
  show($("syncNow"), online && pending.length > 0);
}

function scheduleRetry() {
  if (retryTimer || !navigator.onLine) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    synchronize();
  }, 60000);
}

async function synchronize() {
  if (syncing || !navigator.onLine) return;
  if (retryTimer) {
    window.clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  syncing = true;
  let failed = false;
  try {
    for (const record of await pendingRecords()) {
      try {
        await rpc("sincronizar", record);
        await removePending(record.idEnvio);
      } catch {
        failed = true;
        break;
      }
    }
  } finally {
    syncing = false;
    updateStatus();
    if (failed) scheduleRetry();
  }
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function formData() {
  return {
    idEnvio: newId(),
    criadoEm: new Date().toISOString(),
    atrativo: $("attraction").value,
    nome: $("name").value.trim(),
    tipoAtendimento: selected("attendanceType"),
    nacionalidade: selected("nationality"),
    paisOrigem: $("country").value,
    estadoOrigem: $("state").value,
    informacao: $("information").value,
    informacaoOutro: $("otherInformation").value.trim(),
    quantidadeGrupo: $("groupSize").value,
    observacoes: $("notes").value.trim()
  };
}

function resetForNextAttendance(name, attraction) {
  $("form").reset();
  $("name").value = name;
  lockName();
  $("attraction").value = attraction;
  configureAttraction();
  $("countrySearch").value = "";
  populateCountries();
  setMessage();
  updateSaveButton();
}

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  updateSaveButton();
  if ($("save").disabled) return setMessage("Preencha todos os campos obrigatórios.", true);

  const data = formData();
  await writeValue(QUEUE_STORE, data);
  await writeValue(PREFERENCES_STORE, data.nome, "nome");
  $("formScreen").classList.add("hidden");
  $("successScreen").classList.remove("hidden");
  updateStatus();
  synchronize();

  $("newAttendance").onclick = () => {
    resetForNextAttendance(data.nome, data.atrativo);
    $("successScreen").classList.add("hidden");
    $("formScreen").classList.remove("hidden");
    $("information").focus();
  };
});

$("changeName").addEventListener("click", async () => {
  $("name").value = "";
  unlockName();
  await writeValue(PREFERENCES_STORE, "", "nome");
  $("name").focus();
  updateSaveButton();
});

$("changeAttraction").addEventListener("click", () => {
  $("attraction").disabled = false;
  show($("changeAttraction"), false);
  $("attraction").focus();
});

$("attraction").addEventListener("change", configureAttraction);
$("name").addEventListener("blur", () => { lockName(); updateSaveButton(); });
$("countrySearch").addEventListener("input", () => populateCountries($("countrySearch").value));
$("information").addEventListener("change", () => {
  show($("otherField"), $("information").value === "Outros");
  updateSaveButton();
});

document.querySelectorAll('input[name="attendanceType"], input[name="nationality"]').forEach((input) => {
  input.addEventListener("change", () => { configureOrigin(); updateSaveButton(); });
});
["country", "state", "otherInformation", "groupSize", "notes"].forEach((id) => {
  $(id).addEventListener("input", updateSaveButton);
  $(id).addEventListener("change", updateSaveButton);
});

$("syncNow").addEventListener("click", synchronize);
window.addEventListener("online", () => { updateStatus(); refreshOptions(); synchronize(); });
window.addEventListener("offline", updateStatus);

(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
  $("name").value = await readValue(PREFERENCES_STORE, "nome") || "";
  if ($("name").value) lockName();
  savedAttraction = await readValue(PREFERENCES_STORE, "atrativo") || localStorage.getItem("atrativo") || "";
  if (savedAttraction) await writeValue(PREFERENCES_STORE, savedAttraction, "atrativo");
  options = await readValue(OPTIONS_STORE, "atual");
  renderOptions();
  updateStatus();
  refreshOptions();
  synchronize();
})();
