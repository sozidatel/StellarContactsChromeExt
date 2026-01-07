const ext = typeof browser !== 'undefined' ? browser : chrome;

const API_BASE_URL = "https://bsn.expert";
const SYNC_URL = `${API_BASE_URL}/api/contacts/sync`;
const SYNC_MIN_INTERVAL_MS = 60000;

const DEFAULT_META = {
    apiKey: "",
    lastSyncAt: 0,
    lastSyncError: null,
    lastApiCheck: null,
    lastSyncAttempt: 0
};

let state = {
    contacts: {},
    meta: { ...DEFAULT_META }
};

let syncInProgress = false;

function storageGet(keys) {
    return new Promise((resolve) => ext.storage.local.get(keys, resolve));
}

function storageSet(values) {
    return new Promise((resolve) => ext.storage.local.set(values, resolve));
}

function normalizeStoredContacts(raw) {
    const now = Date.now();
    let parsed = {};
    let needsSave = false;

    if (raw) {
        try {
            parsed = JSON.parse(raw.replace(/^\s+\/\/.*\n/gm, ''));
        } catch (e) {
            console.warn('Cannot parse contacts JSON:', e.message);
        }
    }

    const normalized = {};
    if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, value]) => {
            if (!id) return;
            if (value && typeof value === 'object') {
                const updatedAt = Number(value.updated_at);
                normalized[id] = {
                    label: value.label === undefined || value.label === null ? null : value.label,
                    updated_at: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
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
    const { contacts, syncMeta } = await storageGet(['contacts', 'syncMeta']);
    const { contacts: parsedContacts, needsSave } = normalizeStoredContacts(contacts);
    state.contacts = parsedContacts;
    state.meta = { ...DEFAULT_META, ...(syncMeta || {}) };

    if (needsSave) {
        await persistState();
    }
}

function persistState() {
    return storageSet({
        contacts: JSON.stringify(state.contacts),
        syncMeta: state.meta
    });
}

function toPlainContacts() {
    const result = {};
    Object.entries(state.contacts || {}).forEach(([id, entry]) => {
        if (!entry) return;
        if (entry.label === null || entry.label === undefined) return;
        result[id] = entry.label;
    });
    return result;
}

function changedItems() {
    const lastSyncAt = Number(state.meta.lastSyncAt) || 0;
    const items = {};

    Object.entries(state.contacts).forEach(([id, entry]) => {
        if (!entry) return;
        const updatedAt = Number(entry.updated_at) || 0;
        const shouldSend = entry.label === null || updatedAt === 0 || updatedAt > lastSyncAt;

        if (shouldSend) {
            items[id] = {
                label: entry.label,
                updated_at: updatedAt || Date.now()
            };
        }
    });

    return items;
}

function applyRemoteItems(items, syncedAt) {
    if (!items || typeof items !== 'object') return false;
    const syncMoment = Number(syncedAt) || Date.now();
    let changed = false;

    Object.entries(items).forEach(([id, entry]) => {
        if (!entry) return;
        const incomingUpdatedAt = Number(entry.updated_at) || 0;
        const current = state.contacts[id];
        const currentUpdatedAt = Number(current?.updated_at) || 0;

        if (incomingUpdatedAt && incomingUpdatedAt < currentUpdatedAt) {
            return;
        }

        if (entry.label === null || entry.label === undefined) {
            if (current !== undefined) {
                delete state.contacts[id];
                changed = true;
            }
            return;
        }

        const nextUpdated = incomingUpdatedAt || syncMoment;
        const currentLabel = current ? current.label : undefined;
        if (currentLabel !== entry.label || currentUpdatedAt !== nextUpdated) {
            state.contacts[id] = {
                label: entry.label,
                updated_at: nextUpdated
            };
            changed = true;
        }
    });

    return changed;
}

async function readErrorMessage(response) {
    try {
        const text = await response.text();
        if (!text) return `${response.status} ${response.statusText}`;
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                if (parsed.message) return parsed.message;
                if (parsed.error) return parsed.error;
            }
        } catch (e) {
            // not json, use raw text
        }
        return text;
    } catch (e) {
        return `${response.status} ${response.statusText}`;
    }
}

async function syncContacts() {
    const payload = {
        current_timestamp: Date.now(),
        items: changedItems()
    };

    try {
        const response = await fetch(SYNC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${state.meta.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            state.meta.lastSyncError = await readErrorMessage(response);
            await persistState();
            return false;
        }

        const data = await response.json();
        const syncMoment = Date.now();
        const updated = applyRemoteItems(data.items, syncMoment);
        state.meta.lastSyncAt = syncMoment;
        state.meta.lastSyncError = null;
        await persistState();
        return updated;
    } catch (e) {
        state.meta.lastSyncError = e && e.message ? e.message : 'Network error';
        await persistState();
        return false;
    }
}

async function maybeSyncAndRefresh() {
    if (!state.meta.apiKey) return;
    if (syncInProgress) return;

    const now = Date.now();
    const lastAttempt = Number(state.meta.lastSyncAttempt) || 0;
    if (now - lastAttempt < SYNC_MIN_INTERVAL_MS) return;

    syncInProgress = true;
    state.meta.lastSyncAttempt = now;
    await persistState();

    const updated = await syncContacts();
    syncInProgress = false;

    if (updated) {
        stellarContactsAction(toPlainContacts());
    }
}

function stellarContactsGo() {
    loadState()
        .then(() => {
            const contacts = toPlainContacts();
            stellarContactsAction(contacts);
            maybeSyncAndRefresh().catch((e) => console.error('Sync failed:', e));
        })
        .catch((e) => console.error('Failed to load contacts:', e));
}

function stellarContactsAction(contacts) {
    console.debug("Начали работу поиска и замены.");

    const reg = /G[A-Z2-7]{55}/;

    if ([
        "bsn.expert",
        "stellar.expert",
        "crowd.mtla.me",
        "eurmtl.me",
        "viewer.eurmtl.me"
    ].includes(location.host)) {
        console.debug("Знакомый адрес: " + location.toString());
        jQuery('a').each(function () {
            const $element = jQuery(this);
            const match = /\/(G[A-Z2-7]{55})/.exec($element.attr('href'));
            if (match && match[1] && contacts[match[1]]) {
                console.debug("Найдена ссылка: " + $element.attr('href'));
                processLink($element, match[1], contacts[match[1]]);
            }
        });
    } else if (location.host === "lab.stellar.org") {
        jQuery('.PrettyJson__value--string').each(function () {
            const $element = jQuery(this);
            $element.text($element.text().replace(reg, function (match) {
                console.log(match);
                if (match && contacts[match]) {
                    return match + " [" + contacts[match] + "]";
                } else return match;
            }))
        });
    }

    function processLink($link, account, name) {
        if ($link.hasClass('stellar-contact-done')) return;
        const text = $link.text();
        if (!text) return;
        if (text.indexOf("📒") !== -1) return;

        const start = account.substring(0, 2);
        const end = account.substring(account.length - 2);
        const lastSix = account.substring(account.length - 6);

        const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const shortAccountRegExp = new RegExp(`${escapedStart}\\S*${escapedEnd}`);
        const match = text.match(shortAccountRegExp);

        if (match) {
            const replacement = `${start}…${lastSix} [📒 ${name}]`;
            $link.text(text.replace(match[0], replacement)).addClass('stellar-contact-done');
        }
    }
}

ext.runtime.onMessage.addListener(function() {
    stellarContactsGo();
});
