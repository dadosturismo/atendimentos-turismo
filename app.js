const GAS_URL = "https://script.google.com/macros/s/AKfycbxWamWQao1eQXOYOrH0mDIl2QyEmQqE75UVit36eptNhIF0Ju87qwNNfgk9DGdWJAP5/exec";
const DB_NAME = "turismo-atendimentos-v4";
const QUEUE_STORE = "pendentes";
const OPTIONS_STORE = "opcoes";
const PREFERENCES_STORE = "preferencias";
const SESSION_TOKEN_KEY = "cturAtendimentosSessionToken";
const SESSION_USER_KEY = "cturAtendimentosSessionUser";
const $ = (id) => document.getElementById(id);

let options;
let sessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
let sessionUser = localStorage.getItem(SESSION_USER_KEY) || "";
let syncing = false;
let savedAttraction = "";
let retryTimer;
let editingIdentification = false;
let selectedInformationItems = [];
const RENAMED_ATTRACTIONS = { "Torre Panorâmica": "Torre Panorâmica (Recepção)" };
const ATRATIVOS_FORCADOS_POR_USUARIO = {
  adminTORRE: ["Torre Panorâmica (Recepção)"],
  adminTORREELEVADOR: ["Torre Panorâmica (Elevador)"]
};

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

function requiresInformation(config) {
  return config?.solicitaInformacao !== false;
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

function matchingCountries(filter = "") {
  const text = normalize(filter);
  return (options?.paises || []).filter((country) => normalize(country).includes(text));
}

function hideCountrySuggestions() {
  show($("countrySuggestions"), false);
  $("country").setAttribute("aria-expanded", "false");
}

function setCountry(country) {
  $("country").value = country;
  hideCountrySuggestions();
  updateSaveButton();
}

function renderCountrySuggestions() {
  const input = $("country");
  const suggestions = $("countrySuggestions");
  const countries = matchingCountries(input.value);
  suggestions.replaceChildren();

  if (input.disabled || !input.value.trim() || !countries.length) return hideCountrySuggestions();
  countries.forEach((country) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion";
    option.role = "option";
    option.textContent = country;
    option.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setCountry(country);
    });
    option.addEventListener("click", () => setCountry(country));
    suggestions.append(option);
  });
  show(suggestions, true);
  input.setAttribute("aria-expanded", "true");
}

function renderSelectedInformations() {
  const container = $("selectedInformations");
  container.replaceChildren();
  selectedInformationItems.forEach((item, index) => {
    const tag = document.createElement("span");
    tag.className = "information-tag";
    tag.append(document.createTextNode(item.informacao === "Outros" ? `Outros: ${item.informacaoOutro}` : item.informacao));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-information";
    remove.dataset.index = String(index);
    remove.setAttribute("aria-label", `Remover ${item.informacao}`);
    remove.textContent = "×";
    tag.append(remove);
    container.append(tag);
  });
}

function addSelectedInformation() {
  const information = $("information").value;
  const otherInformation = $("otherInformation").value.trim();
  if (!information) return setMessage("Selecione uma informação para adicionar.", true);
  if (information === "Outros" && !otherInformation) {
    show($("otherField"), true);
    $("otherInformation").focus();
    return setMessage("Descreva a outra informação antes de adicionar.", true);
  }
  if (selectedInformationItems.some((item) => item.informacao === information)) {
    return setMessage("Esta informação já foi adicionada.", true);
  }
  selectedInformationItems.push({ informacao: information, informacaoOutro: information === "Outros" ? otherInformation : "" });
  $("information").value = "";
  $("otherInformation").value = "";
  show($("otherField"), false);
  renderSelectedInformations();
  setMessage();
  updateSaveButton();
}

function show(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function identificationIsComplete() {
  return Boolean($("name").value.trim() && currentAttraction());
}

function renderIdentification() {
  const collapsed = identificationIsComplete() && !editingIdentification;
  show($("identificationFields"), !collapsed);
  show($("identificationSummary"), collapsed);

  if (collapsed) {
    $("summaryAttraction").textContent = $("attraction").value;
    $("summaryName").textContent = $("name").value.trim();
    $("attraction").disabled = true;
    $("name").readOnly = true;
    return;
  }

  $("attraction").disabled = !options;
  $("name").readOnly = false;
}

function lockName() {
  const name = $("name");
  if (!name.value.trim()) return;
  writeValue(PREFERENCES_STORE, name.value.trim(), "nome");
  if (currentAttraction()) editingIdentification = false;
  renderIdentification();
}

function setAutomaticCityRegionState(enabled) {
  const state = $("state");
  const existingOption = state.querySelector('option[data-automatic-city-region]');
  const value = "Curitiba e Região Metropolitana";

  if (enabled) {
    if (!existingOption) {
      const option = new Option(value, value);
      option.dataset.automaticCityRegion = "true";
      state.add(option);
    }
    state.value = value;
    return;
  }

  if (existingOption) {
    const wasSelected = state.value === value;
    existingOption.remove();
    if (wasSelected) state.value = "";
  }
}

function configureOrigin() {
  const type = selected("attendanceType");
  const cityRegion = type === "Curitiba e Região Metropolitana";
  const visitor = type === "Visitante";
  let nationality = selected("nationality");

  if (cityRegion) {
    document.querySelector('input[name="nationality"][value="Brasileiro"]').checked = true;
    nationality = "Brasileiro";
    setCountry("Brasil");
    setAutomaticCityRegionState(true);
    $("automaticOrigin").textContent = "Origem definida automaticamente: Brasil · Paraná.";
  } else {
    setAutomaticCityRegionState(false);
  }

  const brazilian = nationality === "Brasileiro";
  const foreign = nationality === "Estrangeiro";

  show($("nationalityField"), visitor);
  show($("originFields"), visitor && Boolean(nationality));
  show($("automaticOrigin"), cityRegion);

  show($("stateField"), cityRegion || brazilian);
  show($("countryField"), visitor);

  $("country").disabled = !visitor || !nationality || brazilian;
  $("state").disabled = !(cityRegion || brazilian);

  if (brazilian) {
    setCountry("Brasil");
  }
  if (!visitor && !cityRegion) {
    setCountry("");
    $("state").value = "";
  }
  if (foreign) {
    if ($("country").value === "Brasil") setCountry("");
    $("state").value = "";
  }
}

function configureAttraction() {
  const config = currentAttraction();
  if (!config) {
    $("information").disabled = true;
    $("information").required = false;
    selectedInformationItems = [];
    renderSelectedInformations();
    show($("informationField"), false);
    show($("otherField"), false);
    show($("groupField"), false);
    $("groupSize").required = false;
    renderIdentification();
    updateSaveButton();
    return;
  }

  populateInformation(config);
  const informationRequired = requiresInformation(config);
  $("information").disabled = !informationRequired;
  $("information").required = false;
  $("information").value = "";
  $("otherInformation").value = "";
  selectedInformationItems = [];
  renderSelectedInformations();
  show($("informationField"), informationRequired);
  show($("otherField"), false);
  show($("groupField"), config.permiteGrupo);
  $("groupSize").required = config.permiteGrupo;
  savedAttraction = $("attraction").value;
  writeValue(PREFERENCES_STORE, $("attraction").value, "atrativo");
  if ($("name").value.trim()) editingIdentification = false;
  renderIdentification();
  configureOrigin();
  updateSaveButton();
}

function renderOptions() {
  if (!options) return;
  const forcedAttractions = ATRATIVOS_FORCADOS_POR_USUARIO[sessionUser];
  const permittedAttractions = (forcedAttractions || Object.keys(options.atrativos))
    .filter((attraction) => Boolean(options.atrativos[attraction]));
  const savedValue = $("attraction").value || savedAttraction;
  const attractionToRestore = options.atrativos[savedValue] ? savedValue : (RENAMED_ATTRACTIONS[savedValue] || savedValue);
  populateSelect($("attraction"), permittedAttractions, "Selecione o atrativo");
  populateSelect($("state"), options.estados, "Selecione o estado");
  const hasOnlyOneAttraction = permittedAttractions.length === 1;
  show($("attractionField"), !hasOnlyOneAttraction);
  $("attraction").disabled = hasOnlyOneAttraction;
  $("attraction").required = !hasOnlyOneAttraction;

  if (hasOnlyOneAttraction) {
    $("attraction").value = permittedAttractions[0];
    savedAttraction = permittedAttractions[0];
    configureAttraction();
    return;
  }

  if (options.atrativos[attractionToRestore]) {
    $("attraction").value = attractionToRestore;
    savedAttraction = attractionToRestore;
    configureAttraction();
  } else {
    renderIdentification();
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
  const informationRequired = requiresInformation(config);
  const countryIsValid = (options?.paises || []).includes($("country").value);
  const ready = Boolean(
    config &&
    $("name").value.trim() &&
    type &&
    (cityRegion || nationality) &&
    countryIsValid &&
    (!needsState || $("state").value) &&
    (!informationRequired || selectedInformationItems.length) &&
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
    [["action", action], ["payload", encodePayload(payload || {})], ["origin", location.origin], ["nonce", nonce], ["token", sessionToken]].forEach(([name, value]) => {
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
  const response = await rpc("opcoes", {});
  options = response.opcoes;
  sessionUser = options.usuario || sessionUser;
  localStorage.setItem(SESSION_USER_KEY, sessionUser);
  await writeValue(OPTIONS_STORE, { usuario: sessionUser, opcoes: options }, "atual");
  renderOptions();
  return options;
}

function setLoginMessage(text = "", isError = false) {
  $("loginMessage").textContent = text;
  $("loginMessage").classList.toggle("error", isError);
}

function isSessionError(error) {
  return /sessão inválida|sessão expirada/i.test(String(error?.message || error || ""));
}

function showLogin(message = "", isError = false) {
  show($("loginScreen"), true);
  show($("appShell"), false);
  show($("sessionBar"), false);
  setLoginMessage(message, isError);
}

async function restoreSavedFormPreferences() {
  $("name").value = await readValue(PREFERENCES_STORE, "nome") || "";
  if ($("name").value) lockName();
  savedAttraction = await readValue(PREFERENCES_STORE, "atrativo") || localStorage.getItem("atrativo") || "";
  if (savedAttraction) await writeValue(PREFERENCES_STORE, savedAttraction, "atrativo");
}

async function enterAuthenticatedApp(currentOptions, restorePreferences = false) {
  options = currentOptions;
  sessionUser = options.usuario || sessionUser;
  localStorage.setItem(SESSION_USER_KEY, sessionUser);
  $("sessionUser").textContent = `Acesso: ${sessionUser}`;
  show($("loginScreen"), false);
  show($("appShell"), true);
  show($("sessionBar"), true);
  if (restorePreferences) await restoreSavedFormPreferences();
  renderOptions();
  await updateStatus();
  synchronize();
}

function clearLocalSession() {
  sessionToken = "";
  sessionUser = "";
  options = undefined;
  syncing = false;
  editingIdentification = false;
  selectedInformationItems = [];
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  $("form").reset();
  $("formScreen").classList.remove("hidden");
  $("successScreen").classList.add("hidden");
}

async function restoreAuthenticatedSession() {
  if (!sessionToken || !sessionUser) return showLogin();
  const cached = await readValue(OPTIONS_STORE, "atual");
  const cachedOptions = cached?.usuario === sessionUser ? cached.opcoes : null;
  if (!navigator.onLine) {
    if (!cachedOptions) return showLogin("Conecte este dispositivo à internet para validar o acesso pela primeira vez.", true);
    await enterAuthenticatedApp(cachedOptions, true);
    setMessage("Você está offline. O acesso será validado quando a conexão voltar.", true);
    return;
  }
  try {
    const response = await rpc("opcoes", {});
    await enterAuthenticatedApp(response.opcoes, true);
    await writeValue(OPTIONS_STORE, { usuario: sessionUser, opcoes: options }, "atual");
  } catch (error) {
    clearLocalSession();
    showLogin(error.message || "Não foi possível validar o acesso.", true);
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const login = $("login").value.trim();
  const senha = $("password").value;
  if (!login || !senha) return setLoginMessage("Informe login e senha.", true);
  const button = $("loginSubmit");
  button.disabled = true;
  setLoginMessage();
  try {
    const response = await rpc("login", { login, senha });
    const session = response.dados;
    sessionToken = session.token;
    sessionUser = session.usuario;
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    localStorage.setItem(SESSION_USER_KEY, sessionUser);
    $("password").value = "";
    await writeValue(OPTIONS_STORE, { usuario: sessionUser, opcoes: session.opcoes }, "atual");
    await enterAuthenticatedApp(session.opcoes, true);
  } catch (error) {
    setLoginMessage(error.message || "Não foi possível entrar.", true);
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  const token = sessionToken;
  try {
    if (token && navigator.onLine) await rpc("logout", {});
  } catch (_) {
    // Encerrar localmente continua protegendo o dispositivo mesmo sem conexão.
  } finally {
    clearLocalSession();
    showLogin();
    $("login").focus();
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
  if (syncing || !navigator.onLine || !sessionToken) return;
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
      } catch (error) {
        if (isSessionError(error)) {
          clearLocalSession();
          showLogin("Sua sessão expirou. Entre novamente para sincronizar os atendimentos pendentes.", true);
          return;
        }
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
    informacoes: selectedInformationItems.map((item) => ({ ...item })),
    quantidadeGrupo: $("groupSize").value,
    observacoes: $("notes").value.trim()
  };
}

function resetForNextAttendance(name, attraction) {
  $("form").reset();
  editingIdentification = false;
  $("name").value = name;
  $("attraction").value = attraction;
  configureAttraction();
  hideCountrySuggestions();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
});

$("changeIdentification").addEventListener("click", () => {
  editingIdentification = true;
  renderIdentification();
  $("attraction").focus();
});

$("loginForm").addEventListener("submit", submitLogin);
$("logout").addEventListener("click", logout);
$("attraction").addEventListener("change", configureAttraction);
$("name").addEventListener("blur", () => { lockName(); updateSaveButton(); });
$("country").addEventListener("input", () => { renderCountrySuggestions(); updateSaveButton(); });
$("country").addEventListener("blur", () => window.setTimeout(hideCountrySuggestions, 150));
$("country").addEventListener("keydown", (event) => { if (event.key === "Escape") hideCountrySuggestions(); });
$("information").addEventListener("change", () => {
  const isOther = $("information").value === "Outros";
  show($("otherField"), isOther);
  if (isOther) return $("otherInformation").focus();
  $("otherInformation").value = "";
  addSelectedInformation();
});
$("otherInformation").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addSelectedInformation();
});
$("otherInformation").addEventListener("blur", () => {
  if ($("information").value === "Outros" && $("otherInformation").value.trim()) addSelectedInformation();
});
$("selectedInformations").addEventListener("click", (event) => {
  const remove = event.target.closest("button[data-index]");
  if (!remove) return;
  selectedInformationItems.splice(Number(remove.dataset.index), 1);
  renderSelectedInformations();
  updateSaveButton();
});
document.querySelectorAll('input[name="attendanceType"], input[name="nationality"]').forEach((input) => {
  input.addEventListener("change", () => { configureOrigin(); updateSaveButton(); });
});
["state", "otherInformation", "groupSize", "notes"].forEach((id) => {
  $(id).addEventListener("input", updateSaveButton);
  $(id).addEventListener("change", updateSaveButton);
});

$("syncNow").addEventListener("click", synchronize);
window.addEventListener("online", async () => {
  if (!sessionToken) return;
  try {
    await refreshOptions();
    await synchronize();
  } catch (error) {
    if (isSessionError(error)) {
      clearLocalSession();
      showLogin("Sua sessão expirou. Entre novamente.", true);
    } else {
      updateStatus();
    }
  }
});
window.addEventListener("offline", updateStatus);

(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
  await restoreAuthenticatedSession();
})();
