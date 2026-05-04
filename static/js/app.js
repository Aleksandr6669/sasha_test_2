/* ===== Diary App — Client-side Logic (IndexedDB + LocalStorage fallback) ===== */

const DB_NAME = 'diary_db';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

let db = null;
let allEntries = [];
let currentEntryId = null;
let selectedMood = null;
let deleteCallback = null;

/* ===== IndexedDB ===== */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        const store = idb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('createdAt').getAll();
    req.onsuccess = e => resolve(e.target.result.reverse());
    req.onerror   = e => reject(e.target.error);
  });
}

function dbAdd(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).add(entry);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

/* ===== LocalStorage Fallback ===== */
const LS_KEY = 'diary_entries';

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsSave(entries) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch {}
}

function lsNextId(entries) {
  return entries.length ? Math.max(...entries.map(e => e.id)) + 1 : 1;
}

/* ===== Unified Storage API ===== */
async function loadEntries() {
  if (db) {
    allEntries = await dbGetAll();
  } else {
    allEntries = lsLoad().sort((a, b) => b.createdAt - a.createdAt);
  }
}

async function saveEntry(entry) {
  if (db) {
    if (entry.id) {
      await dbPut(entry);
    } else {
      const id = await dbAdd(entry);
      entry.id = id;
    }
  } else {
    const entries = lsLoad();
    if (entry.id) {
      const idx = entries.findIndex(e => e.id === entry.id);
      if (idx !== -1) entries[idx] = entry;
    } else {
      entry.id = lsNextId(entries);
      entries.push(entry);
    }
    lsSave(entries);
  }
}

async function deleteEntry(id) {
  if (db) {
    await dbDelete(id);
  } else {
    const entries = lsLoad().filter(e => e.id !== id);
    lsSave(entries);
  }
}

/* ===== Rendering ===== */
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderEntries(entries) {
  const container = document.getElementById('entries-container');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('entries-count');

  countEl.textContent = entries.length === 0
    ? 'Нет записей'
    : `${entries.length} ${pluralize(entries.length, 'запись', 'записи', 'записей')}`;

  if (entries.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  container.innerHTML = entries.map(entry => `
    <article class="entry-card" data-id="${entry.id}" tabindex="0" role="button" aria-label="${escapeHtml(entry.title) || 'Без заголовка'}">
      <div class="entry-card-header">
        <span class="entry-mood">${entry.mood || '📝'}</span>
        <div class="entry-meta">
          <div>${formatDate(entry.createdAt)}</div>
          <div>${formatTime(entry.updatedAt || entry.createdAt)}</div>
        </div>
      </div>
      <div class="entry-title ${entry.title ? '' : 'untitled'}">${escapeHtml(entry.title) || 'Без заголовка'}</div>
      ${entry.content ? `<div class="entry-preview">${escapeHtml(entry.content)}</div>` : ''}
    </article>
  `).join('');

  container.querySelectorAll('.entry-card').forEach(card => {
    card.addEventListener('click', () => openEditModal(parseInt(card.dataset.id)));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openEditModal(parseInt(card.dataset.id));
    });
  });
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/* ===== Modal ===== */
function openNewModal() {
  currentEntryId = null;
  selectedMood = null;

  document.getElementById('modal-title').textContent = 'Новая запись';
  document.getElementById('entry-title').value = '';
  document.getElementById('entry-content').value = '';
  document.getElementById('char-count').textContent = '0';
  document.getElementById('modal-delete').style.display = 'none';

  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));

  openOverlay('modal-overlay');
  document.getElementById('entry-title').focus();
}

function openEditModal(id) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;
  currentEntryId = id;
  selectedMood = entry.mood || null;

  document.getElementById('modal-title').textContent = 'Редактировать запись';
  document.getElementById('entry-title').value = entry.title || '';
  document.getElementById('entry-content').value = entry.content || '';
  document.getElementById('char-count').textContent = (entry.content || '').length;
  document.getElementById('modal-delete').style.display = 'flex';

  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.mood === selectedMood);
  });

  openOverlay('modal-overlay');
  document.getElementById('entry-title').focus();
}

function closeModal() {
  closeOverlay('modal-overlay');
  currentEntryId = null;
}

function openOverlay(id) {
  const el = document.getElementById(id);
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  el.classList.remove('active');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ===== Save / Delete ===== */
async function handleSave() {
  const title = document.getElementById('entry-title').value.trim();
  const content = document.getElementById('entry-content').value.trim();

  if (!title && !content) {
    showToast('Запись не может быть пустой', 'error');
    return;
  }

  const now = Date.now();
  let entry;

  if (currentEntryId) {
    entry = allEntries.find(e => e.id === currentEntryId);
    entry.title = title;
    entry.content = content;
    entry.mood = selectedMood;
    entry.updatedAt = now;
  } else {
    entry = { title, content, mood: selectedMood, createdAt: now, updatedAt: now };
  }

  try {
    await saveEntry(entry);
    await loadEntries();
    renderEntries(filterEntries());
    closeModal();
    showToast(currentEntryId ? 'Запись обновлена ✓' : 'Запись сохранена ✓', 'success');
  } catch (err) {
    console.error(err);
    showToast('Ошибка при сохранении', 'error');
  }
}

function handleDeleteClick() {
  deleteCallback = async () => {
    try {
      await deleteEntry(currentEntryId);
      await loadEntries();
      renderEntries(filterEntries());
      closeModal();
      closeOverlay('confirm-overlay');
      showToast('Запись удалена', 'success');
    } catch (err) {
      console.error(err);
      showToast('Ошибка при удалении', 'error');
    }
  };
  openOverlay('confirm-overlay');
}

/* ===== Search ===== */
function filterEntries() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  if (!q) return allEntries;
  return allEntries.filter(e =>
    (e.title || '').toLowerCase().includes(q) ||
    (e.content || '').toLowerCase().includes(q)
  );
}

/* ===== Toast ===== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ===== Init ===== */
async function init() {
  try {
    db = await openDB();
  } catch (err) {
    console.warn('IndexedDB unavailable, using LocalStorage:', err);
    db = null;
  }

  await loadEntries();
  renderEntries(allEntries);

  /* New entry buttons */
  document.getElementById('new-entry-btn').addEventListener('click', openNewModal);
  document.getElementById('empty-new-btn').addEventListener('click', openNewModal);

  /* Modal close */
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  /* Save / Delete */
  document.getElementById('modal-save').addEventListener('click', handleSave);
  document.getElementById('modal-delete').addEventListener('click', handleDeleteClick);

  /* Confirm dialog */
  document.getElementById('confirm-yes').addEventListener('click', () => {
    if (deleteCallback) deleteCallback();
  });
  document.getElementById('confirm-no').addEventListener('click', () => {
    closeOverlay('confirm-overlay');
  });
  document.getElementById('confirm-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('confirm-overlay')) closeOverlay('confirm-overlay');
  });

  /* Mood selector */
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.dataset.mood;
      if (selectedMood === mood) {
        selectedMood = null;
        btn.classList.remove('selected');
      } else {
        selectedMood = mood;
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      }
    });
  });

  /* Char counter */
  document.getElementById('entry-content').addEventListener('input', function() {
    document.getElementById('char-count').textContent = this.value.length;
  });

  /* Search */
  const searchInput = document.getElementById('search-input');
  const clearSearch = document.getElementById('clear-search');
  searchInput.addEventListener('input', () => {
    clearSearch.style.display = searchInput.value ? 'flex' : 'none';
    renderEntries(filterEntries());
  });
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    renderEntries(allEntries);
    searchInput.focus();
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('confirm-overlay').classList.contains('active')) {
        closeOverlay('confirm-overlay');
      } else if (document.getElementById('modal-overlay').classList.contains('active')) {
        closeModal();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (document.getElementById('modal-overlay').classList.contains('active')) {
        handleSave();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
