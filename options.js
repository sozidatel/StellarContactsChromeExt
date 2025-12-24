const ext = typeof browser !== "undefined" ? browser : chrome;

const API_BASE_URL = "https://bsn.expert";
const API_CHECK_URL = `${API_BASE_URL}/api`;
const SYNC_URL = `${API_BASE_URL}/api/contacts/sync`;

const DEFAULT_META = {
  apiKey: "",
  lastSyncAt: 0,
  lastSyncError: null,
  lastApiCheck: null,
  lastSyncAttempt: 0,
};

let contactsGrid;
let state = {
  contacts: {},
  meta: { ...DEFAULT_META },
};

let apiKeyValidationTimer = null;

function storageGet(keys) {
  return new Promise((resolve) => ext.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => ext.storage.local.set(values, resolve));
}

function getMsg(name, substitutions) {
  return ext.i18n.getMessage(name, substitutions);
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeContacts(raw) {
  const now = Date.now();
  let parsed = {};
  let needsSave = false;

  if (raw) {
    try {
      parsed = JSON.parse(raw.replace(/^\s+\/\/.*\n/gm, ""));
    } catch (e) {
      console.warn("Cannot parse contacts JSON:", e.message);
    }
  }

  const normalized = {};
  if (parsed && typeof parsed === "object") {
    Object.entries(parsed).forEach(([id, value]) => {
      if (!id) return;
      if (value && typeof value === "object") {
        const updatedAt = Number(value.updated_at);
        normalized[id] = {
          label:
            value.label === undefined || value.label === null ? null : value.label,
          updated_at: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now,
        };
        if (!Number.isFinite(updatedAt) || updatedAt <= 0) needsSave = true;
      } else {
        normalized[id] = { label: value, updated_at: now };
        needsSave = true;
      }
    });
  }

  return { contacts: normalized, needsSave };
}

async function loadState() {
  const { contacts, syncMeta } = await storageGet(["contacts", "syncMeta"]);
  const { contacts: parsedContacts, needsSave } = normalizeContacts(contacts);
  state.contacts = parsedContacts;
  state.meta = { ...DEFAULT_META, ...(syncMeta || {}) };

  if (needsSave) {
    await persistState();
  }
}

function persistState() {
  return storageSet({
    contacts: JSON.stringify(state.contacts),
    syncMeta: state.meta,
  });
}

function activeContacts() {
  const entries = {};
  Object.entries(state.contacts || {}).forEach(([id, entry]) => {
    if (!entry) return;
    if (entry.label === null || entry.label === undefined) return;
    entries[id] = entry;
  });
  return entries;
}

function rowsFromContacts() {
  return Object.entries(activeContacts()).map(([id, entry]) => ({
    id,
    label: entry.label || "",
  }));
}

function ensureGrid() {
  const rows = rowsFromContacts();
  const initData = rows.length ? rows : [{ id: "", label: "" }];

  const gridConfig = {
    element: "tblAppendGrid",
    initData,
    initRows: initData.length || 1,
    columns: [
      {
        name: "id",
        display: getMsg("tableId"),
        type: "text",
      },
      {
        name: "label",
        display: getMsg("tableName"),
        type: "text",
      },
    ],
    i18n: {
      append: getMsg("tableAppend"),
      remove: getMsg("tableRemove"),
      rowEmpty: getMsg("tableEmpty"),
    },
    hideButtons: {
      removeLast: true,
      insert: true,
      moveUp: true,
      moveDown: true,
    },
  };

  if (!contactsGrid) {
    contactsGrid = new AppendGrid(gridConfig);
  } else {
    contactsGrid.load(initData);
  }
}

function setUiTexts() {
  document.getElementById("header").textContent = getMsg("optYourContacts");
  document.getElementById("btn_save").textContent = getMsg("optButtonSave");
  document.getElementById("btn_export").textContent = getMsg("optButtonExport");
  document.getElementById("btn_import").textContent = getMsg("optButtonImport");
  document.getElementById("description").textContent = getMsg("optDescription");
  document.getElementById("apiKeyLabel").textContent = getMsg("optApiKeyLabel");

  const apiKeyInput = document.getElementById("apiKey");
  apiKeyInput.placeholder = getMsg("optApiKeyPlaceholder");
  apiKeyInput.value = state.meta.apiKey || "";
}

function setSaveStatus(message) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  if (message) {
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1200);
  }
}

function setSyncStatus(type, message) {
  const el = document.getElementById("syncStatus");
  el.textContent = message || "";
  el.classList.remove("status-ok", "status-error", "status-info");
  if (type === "ok") el.classList.add("status-ok");
  else if (type === "error") el.classList.add("status-error");
  else el.classList.add("status-info");
}

function renderSyncStatus() {
  const { meta } = state;
  if (!meta.apiKey) {
    setSyncStatus("info", getMsg("syncStatusNoKey"));
    return;
  }

  if (meta.lastApiCheck && meta.lastApiCheck.status === "error") {
    setSyncStatus("error", meta.lastApiCheck.message);
    return;
  }

  if (meta.lastSyncError) {
    setSyncStatus("error", getMsg("syncStatusSyncError", meta.lastSyncError));
    return;
  }

  if (meta.lastSyncAt) {
    setSyncStatus(
      "ok",
      getMsg("syncStatusOkAt", formatDateTime(meta.lastSyncAt))
    );
    return;
  }

  if (meta.lastApiCheck && meta.lastApiCheck.status === "ok") {
    setSyncStatus("ok", getMsg("syncStatusApiOk"));
    return;
  }

  setSyncStatus("info", getMsg("syncStatusWaiting"));
}

function sanitizeRows(rawRows) {
  return rawRows
    .map((row) => ({
      id: (row.id || "").trim(),
      label: (row.label || "").trim(),
    }))
    .filter((row) => row.id);
}

async function handleApiKeyInput() {
  const apiKeyInput = document.getElementById("apiKey");
  const apiKeyValue = apiKeyInput.value.trim();
  const hasChanged = apiKeyValue !== (state.meta.apiKey || "");

  if (hasChanged) {
    state.meta = {
      ...state.meta,
      apiKey: apiKeyValue,
      lastSyncAt: 0,
      lastSyncError: null,
      lastApiCheck: null,
      lastSyncAttempt: 0,
    };
    await persistState();
  }

  renderSyncStatus();

  if (apiKeyValidationTimer) {
    clearTimeout(apiKeyValidationTimer);
    apiKeyValidationTimer = null;
  }

  if (!apiKeyValue || !hasChanged) return;

  apiKeyValidationTimer = setTimeout(() => {
    validateApiKey();
  }, 400);
}

function buildContactsFromRows(rows, timestamp) {
  const prev = state.contacts || {};
  const next = {};
  const seen = new Set();

  rows.forEach(({ id, label }) => {
    const prevEntry = prev[id];
    const prevLabel =
      prevEntry && prevEntry.label !== null ? prevEntry.label : undefined;
    const changed = !prevEntry || prevLabel !== label;
    next[id] = {
      label,
      updated_at: changed
        ? timestamp
        : Number(prevEntry.updated_at) || timestamp,
    };
    seen.add(id);
  });

  Object.entries(prev).forEach(([id, entry]) => {
    if (seen.has(id)) return;
    if (entry && entry.label === null) {
      next[id] = entry;
      return;
    }
    next[id] = { label: null, updated_at: timestamp };
  });

  return next;
}

async function handleSave() {
  if (!contactsGrid) ensureGrid();
  const rows = contactsGrid ? contactsGrid.getAllValue() : [];
  const normalizedRows = sanitizeRows(rows);
  const timestamp = Date.now();
  const apiKeyValue = document.getElementById("apiKey").value.trim();
  const isNewKey = apiKeyValue !== (state.meta.apiKey || "");

  state.contacts = buildContactsFromRows(normalizedRows, timestamp);

  if (isNewKey) {
    state.meta = {
      ...state.meta,
      apiKey: apiKeyValue,
      lastSyncAt: 0,
      lastSyncError: null,
      lastApiCheck: null,
      lastSyncAttempt: 0,
    };
  } else {
    state.meta = { ...state.meta, apiKey: apiKeyValue };
  }

  await persistState();
  setSaveStatus(getMsg("optSaved"));
  renderSyncStatus();

  if (!apiKeyValue) return;

  await syncContacts();
}

async function readErrorMessage(response) {
  try {
    const text = await response.text();
    if (!text) return `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        if (parsed.message) return parsed.message;
        if (parsed.error) return parsed.error;
      }
    } catch (e) {
      // Not JSON, fall back to text.
    }
    return text;
  } catch (e) {
    return `${response.status} ${response.statusText}`;
  }
}

async function validateApiKey() {
  if (!state.meta.apiKey) {
    renderSyncStatus();
    return false;
  }

  setSyncStatus("info", getMsg("syncStatusChecking"));
  try {
    const response = await fetch(API_CHECK_URL, {
      headers: {
        Authorization: `Bearer ${state.meta.apiKey}`,
      },
    });

    const ok = response.ok;
    const message = ok
      ? getMsg("syncStatusApiOk")
      : getMsg("syncStatusApiError", await readErrorMessage(response));

    state.meta.lastApiCheck = {
      status: ok ? "ok" : "error",
      message,
      checkedAt: Date.now(),
    };

    if (!ok) {
      await persistState();
      renderSyncStatus();
      return false;
    }

    await persistState();
    renderSyncStatus();
    return true;
  } catch (e) {
    const message =
      e && e.message
        ? getMsg("syncStatusApiError", e.message)
        : getMsg("syncStatusApiError", "Network error");

    state.meta.lastApiCheck = {
      status: "error",
      message,
      checkedAt: Date.now(),
    };
    await persistState();
    renderSyncStatus();
    return false;
  }
}

function changedItems() {
  const lastSyncAt = Number(state.meta.lastSyncAt) || 0;
  const items = {};

  Object.entries(state.contacts).forEach(([id, entry]) => {
    if (!entry) return;
    const updatedAt = Number(entry.updated_at) || 0;
    const shouldSend =
      entry.label === null || updatedAt === 0 || updatedAt > lastSyncAt;

    if (shouldSend) {
      items[id] = {
        label: entry.label,
        updated_at: updatedAt || Date.now(),
      };
    }
  });

  return items;
}

function applyRemoteItems(items, syncedAt) {
  if (!items || typeof items !== "object") return;
  const syncMoment = Number(syncedAt) || Number(state.meta.lastSyncAt) || 0;

  Object.entries(items).forEach(([id, entry]) => {
    if (!entry) return;
    const incomingUpdatedAt = Number(entry.updated_at) || 0;
    const current = state.contacts[id];
    const currentUpdatedAt = Number(current?.updated_at) || 0;

    if (incomingUpdatedAt && incomingUpdatedAt < currentUpdatedAt) {
      return;
    }

    if (entry.label === null || entry.label === undefined) {
      delete state.contacts[id];
    } else {
      state.contacts[id] = {
        label: entry.label,
        updated_at: incomingUpdatedAt || Date.now(),
      };
    }
  });

  Object.entries(state.contacts).forEach(([id, entry]) => {
    if (entry && entry.label === null) {
      const updatedAt = Number(entry.updated_at) || 0;
      if (updatedAt <= syncMoment) {
        delete state.contacts[id];
      }
    }
  });
}

async function syncContacts() {
  if (!state.meta.apiKey) {
    renderSyncStatus();
    return;
  }

  const attemptMoment = Date.now();
  state.meta.lastSyncAttempt = attemptMoment;
  await persistState();

  const payload = {
    current_timestamp: Date.now(),
    items: changedItems(),
  };

  try {
    const response = await fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.meta.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      state.meta.lastSyncError = message;
      await persistState();
      renderSyncStatus();
      return;
    }

    const data = await response.json();
    const syncMoment = Date.now();
    applyRemoteItems(data.items, syncMoment);
    state.meta.lastSyncAt = syncMoment;
    state.meta.lastSyncError = null;
    await persistState();
    ensureGrid();
    renderSyncStatus();
  } catch (e) {
    state.meta.lastSyncError = e && e.message ? e.message : "Network error";
    await persistState();
    renderSyncStatus();
  }
}

function exportOptions() {
  const contacts = activeContacts();
  const formatted = {};
  Object.entries(contacts).forEach(([id, entry]) => {
    formatted[id] = { label: entry.label };
  });

  const blob = new Blob([JSON.stringify(formatted, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  ext.downloads.download({
    url: url,
    filename: "StellarContacts.json",
    saveAs: true,
  });
}

function openImportFilePicker() {
  const input = document.getElementById("importFile");
  if (input) input.click();
}

function parseImportedContacts(importedData) {
  const normalized = {};

  Object.entries(importedData || {}).forEach(([accountId, value]) => {
    if (!accountId || accountId.includes(",") || !isNaN(accountId)) return;

    if (typeof value === "object" && value !== null && "label" in value) {
      normalized[accountId] = value.label;
    } else if (typeof value === "string") {
      normalized[accountId] = value;
    }
  });

  return normalized;
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const importedData = JSON.parse(text);
      if (Array.isArray(importedData) || typeof importedData !== "object") {
        console.warn("Unexpected import format, expected object");
        return;
      }
      const normalized = parseImportedContacts(importedData);
      if (!Object.keys(normalized).length) {
        console.warn("No valid contacts found in import");
        return;
      }
      const rows = Object.entries(normalized).map(([id, label]) => ({
        id,
        label,
      }));
      state.contacts = buildContactsFromRows(rows, Date.now());
      await persistState();
      ensureGrid();
      renderSyncStatus();
      setSaveStatus(getMsg("optSaved"));

      if (state.meta.apiKey) {
        const apiOk = await validateApiKey();
        if (apiOk) {
          await syncContacts();
        }
      }
    } catch (err) {
      console.warn("Ошибка JSON при импорте:", err.message);
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function bindEvents() {
  document
    .getElementById("btn_save")
    .addEventListener("click", () => handleSave().catch(console.error));
  document
    .getElementById("btn_export")
    .addEventListener("click", () => exportOptions());
  document
    .getElementById("btn_import")
    .addEventListener("click", openImportFilePicker);
  document
    .getElementById("importFile")
    .addEventListener("change", (event) => handleImport(event));
  document
    .getElementById("apiKey")
    .addEventListener("input", () =>
      handleApiKeyInput().catch((err) =>
        console.error("API key input handler failed:", err)
      )
    );
}

async function init() {
  await loadState();
  setUiTexts();
  ensureGrid();
  renderSyncStatus();

  if (state.meta.apiKey) {
    await syncContacts();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  init().catch((err) => console.error("Failed to init options:", err));
});
