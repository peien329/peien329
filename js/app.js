import * as db from './db.js';
import { createMap } from './map.js';
import { processPhoto } from './image.js';
import { CONTINENTS } from './continents.js';

// 聯合國會員國 193 + 觀察員國 2
const WORLD_COUNT = 195;

const regionNames = new Intl.DisplayNames(['zh-TW'], { type: 'region' });
const collator = new Intl.Collator('zh-TW');
const $ = (sel) => document.querySelector(sel);

const nameOf = (code) => {
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
};
const flagOf = (code) =>
  /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🏳️';
const continentOf = (code) => Object.entries(CONTINENTS).find(([, c]) => c.codes.includes(code))?.[1].name ?? '';

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

const toDateInput = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- 狀態 ----------

const state = {
  statuses: new Map(), // code -> 'visited' | 'wish'
  footprints: [],
  sheetCountry: null,
  view: 'map',
  countryFilter: 'all',
};

let map;
let allCodes = [];

async function reload() {
  const [countries, footprints] = await Promise.all([db.getCountries(), db.getFootprints()]);
  state.statuses = new Map(countries.map((c) => [c.code, c.status]));
  state.footprints = footprints.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  renderAll();
}

function renderAll() {
  map?.setStatuses(state.statuses);
  map?.setPins(state.footprints);
  renderPill();
  if (state.sheetCountry) renderSheet();
  if (state.view === 'countries') renderCountryList();
  if (state.view === 'stats') renderStats();
}

const visitedCodes = () => [...state.statuses].filter(([, s]) => s === 'visited').map(([c]) => c);
const percent = (n) => `${Math.round((n / WORLD_COUNT) * 1000) / 10}%`;

function renderPill() {
  const n = visitedCodes().length;
  $('#stat-pill').textContent = `🌍 ${n} 國 · ${percent(n)}`;
}

// ---------- 縮圖快取 ----------

const thumbCache = new Map();
async function thumbURL(photoId, full = false) {
  const key = full ? `${photoId}:full` : photoId;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = await db.getPhoto(photoId);
  if (!p) return null;
  const url = URL.createObjectURL(full ? p.blob : p.thumb || p.blob);
  thumbCache.set(key, url);
  return url;
}
function forgetPhoto(id) {
  for (const key of [id, `${id}:full`]) {
    if (thumbCache.has(key)) URL.revokeObjectURL(thumbCache.get(key));
    thumbCache.delete(key);
  }
}

function lazyImg(photoId, cls, full = false) {
  const img = h('img', { class: cls, alt: '', loading: 'lazy', decoding: 'async' });
  thumbURL(photoId, full).then((url) => url && (img.src = url));
  return img;
}

// ---------- 分頁 ----------

function showView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'countries') renderCountryList();
  if (view === 'stats') renderStats();
}

// ---------- 國家面板 ----------

function openSheet(code) {
  state.sheetCountry = code;
  map.setSelected(code);
  renderSheet();
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  $('#view-map').classList.add('sheet-open');
}

function closeSheet() {
  state.sheetCountry = null;
  map.setSelected(null);
  $('#sheet').classList.remove('open');
  $('#sheet').setAttribute('aria-hidden', 'true');
  $('#view-map').classList.remove('sheet-open');
}

function footprintCard(fp) {
  const cover = fp.photoIds?.[0];
  return h(
    'button',
    { class: 'fp-card', type: 'button', onclick: () => openViewer(fp.id) },
    cover ? lazyImg(cover, 'fp-cover') : h('div', { class: 'fp-cover empty' }, '📝'),
    h(
      'div',
      { class: 'fp-info' },
      h('strong', {}, fp.title),
      h('span', { class: 'muted' }, [formatDate(fp.date), fp.photoIds?.length ? `${fp.photoIds.length} 張照片` : ''].filter(Boolean).join(' · ')),
      fp.story ? h('p', { class: 'fp-snippet' }, fp.story) : null,
    ),
  );
}

function renderSheet() {
  const code = state.sheetCountry;
  const status = state.statuses.get(code) || '';
  const list = state.footprints.filter((f) => f.country === code);
  $('#sheet-flag').textContent = flagOf(code);
  $('#sheet-name').textContent = nameOf(code);
  $('#sheet-sub').textContent = [continentOf(code), list.length ? `${list.length} 個足跡` : ''].filter(Boolean).join(' · ');
  document.querySelectorAll('#sheet-status button').forEach((b) => {
    const on = b.dataset.status === status;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  const container = $('#sheet-list');
  container.replaceChildren(
    ...(list.length
      ? list.map(footprintCard)
      : [h('p', { class: 'empty-hint' }, status === 'visited' ? '還沒有留下足跡，新增第一個回憶吧！' : '去過這裡嗎？新增足跡記錄你的故事。')]),
  );
}

async function setStatus(code, status) {
  const hasFootprints = state.footprints.some((f) => f.country === code);
  if (status !== 'visited' && hasFootprints) {
    toast('這個國家已經有足跡，要改狀態請先刪除足跡');
    return;
  }
  await db.setCountryStatus(code, status || null);
  requestPersist();
  await reload();
}

// ---------- 國家清單 ----------

function renderCountryList() {
  const q = $('#country-search').value.trim().toLowerCase();
  const counts = new Map();
  for (const f of state.footprints) counts.set(f.country, (counts.get(f.country) || 0) + 1);
  const items = allCodes
    .map((code) => ({ code, name: nameOf(code), status: state.statuses.get(code) || '' }))
    .filter((c) => state.countryFilter === 'all' || c.status === state.countryFilter)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
    .sort((a, b) => collator.compare(a.name, b.name));

  const list = $('#country-list');
  if (!items.length) {
    list.replaceChildren(h('li', { class: 'empty-hint' }, state.countryFilter === 'all' ? '找不到符合的國家' : '這裡還是空的'));
    return;
  }
  list.replaceChildren(
    ...items.map((c) =>
      h(
        'li',
        { class: `country-row ${c.status}` },
        h(
          'button',
          { type: 'button', class: 'country-main', onclick: () => { showView('map'); openSheet(c.code); map.focusCountry(c.code); } },
          h('span', { class: 'flag' }, flagOf(c.code)),
          h('span', { class: 'country-name' }, c.name),
          counts.get(c.code) ? h('span', { class: 'badge' }, `${counts.get(c.code)} 足跡`) : null,
        ),
        h(
          'div',
          { class: 'row-toggles' },
          h('button', { type: 'button', class: `toggle visited ${c.status === 'visited' ? 'on' : ''}`, 'aria-label': '去過', title: '去過', onclick: () => setStatus(c.code, c.status === 'visited' ? '' : 'visited') }, '✓'),
          h('button', { type: 'button', class: `toggle wish ${c.status === 'wish' ? 'on' : ''}`, 'aria-label': '想去', title: '想去', onclick: () => setStatus(c.code, c.status === 'wish' ? '' : 'wish') }, '☆'),
        ),
      ),
    ),
  );
}

// ---------- 統計 ----------

function renderStats() {
  const visited = visitedCodes();
  const wish = [...state.statuses.values()].filter((s) => s === 'wish').length;
  const photos = state.footprints.reduce((n, f) => n + (f.photoIds?.length || 0), 0);
  const visitedSet = new Set(visited);
  const continents = Object.entries(CONTINENTS).map(([key, c]) => ({
    key,
    name: c.name,
    total: c.codes.length,
    n: c.codes.filter((code) => visitedSet.has(code)).length,
  }));
  const continentCount = continents.filter((c) => c.n > 0).length;

  const years = new Map();
  for (const f of state.footprints) {
    const y = f.date ? f.date.slice(0, 4) : '未填日期';
    if (!years.has(y)) years.set(y, new Set());
    years.get(y).add(f.country);
  }
  const yearRows = [...years].sort((a, b) => b[0].localeCompare(a[0]));

  const pct = Math.min(100, (visited.length / WORLD_COUNT) * 100);

  $('#stats').replaceChildren(
    h(
      'div',
      { class: 'hero-card' },
      h(
        'div',
        { class: 'ring', style: `--p:${pct}` },
        h('div', {}, h('strong', {}, visited.length), h('span', {}, '個國家')),
      ),
      h('div', { class: 'hero-text' }, h('h2', {}, `你已經探索了世界的 ${percent(visited.length)}`), h('p', { class: 'muted' }, `以 ${WORLD_COUNT} 個國家計算`)),
    ),
    h(
      'div',
      { class: 'stat-grid' },
      statTile(continentCount, '/ 7 大洲'),
      statTile(state.footprints.length, '個足跡'),
      statTile(photos, '張照片'),
      statTile(wish, '個想去'),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', {}, '各洲進度'),
      ...continents.map((c) =>
        h(
          'div',
          { class: 'bar-row' },
          h('span', { class: 'bar-label' }, c.name),
          h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${(c.n / c.total) * 100}%` })),
          h('span', { class: 'bar-value' }, `${c.n} / ${c.total}`),
        ),
      ),
    ),
    yearRows.length
      ? h(
          'div',
          { class: 'card' },
          h('h3', {}, '旅行年表'),
          ...yearRows.map(([y, set]) =>
            h(
              'div',
              { class: 'year-row' },
              h('strong', {}, y),
              h('div', { class: 'year-flags' }, [...set].map((code) => h('span', { title: nameOf(code) }, flagOf(code)))),
            ),
          ),
        )
      : null,
    visited.length
      ? h(
          'div',
          { class: 'card' },
          h('h3', {}, '去過的國家'),
          h(
            'div',
            { class: 'flag-cloud' },
            visited
              .sort((a, b) => collator.compare(nameOf(a), nameOf(b)))
              .map((code) =>
                h('button', { type: 'button', class: 'flag-chip', onclick: () => { showView('map'); openSheet(code); map.focusCountry(code); } }, `${flagOf(code)} ${nameOf(code)}`),
              ),
          ),
        )
      : h('p', { class: 'empty-hint' }, '在地圖上點國家，或到「國家」分頁勾選你去過的地方。'),
  );
}

const statTile = (n, label) => h('div', { class: 'stat-tile' }, h('strong', {}, n), h('span', {}, label));

// ---------- 查看足跡 ----------

let viewingId = null;

function openViewer(id) {
  const fp = state.footprints.find((f) => f.id === id);
  if (!fp) return;
  viewingId = id;
  $('#viewer-country').textContent = `${flagOf(fp.country)} ${nameOf(fp.country)}`;
  $('#viewer-title').textContent = fp.title;
  $('#viewer-meta').textContent = [formatDate(fp.date), fp.photoIds?.length ? `${fp.photoIds.length} 張照片` : ''].filter(Boolean).join(' · ');
  $('#viewer-story').textContent = fp.story || '';
  $('#viewer-story').hidden = !fp.story;
  $('#viewer-locate').hidden = !Number.isFinite(fp.lat);
  const gallery = $('#viewer-gallery');
  gallery.hidden = !fp.photoIds?.length;
  gallery.replaceChildren(
    ...(fp.photoIds || []).map((pid) => {
      const img = lazyImg(pid, 'gallery-img', true);
      img.addEventListener('click', () => {
        $('#lightbox-img').src = img.src;
        $('#lightbox').showModal();
      });
      return img;
    }),
  );
  if (fp.photoIds?.length > 1) gallery.append(h('span', { class: 'gallery-count' }, `共 ${fp.photoIds.length} 張 · 左右滑動`));
  $('#viewer').showModal();
  $('#viewer .modal-body').scrollTop = 0;
}

// ---------- 編輯足跡 ----------

const editor = {
  fp: null, // 編輯中的既有足跡
  photos: [], // { id, existing: bool, url, data? }
  removed: [],
  lat: null,
  lng: null,
  busy: 0,
};

function fillCountrySelect(selected) {
  const sel = $('#editor-country');
  if (!sel.options.length) {
    const opts = allCodes
      .map((code) => ({ code, name: nameOf(code) }))
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((c) => h('option', { value: c.code }, `${flagOf(c.code)} ${c.name}`));
    sel.replaceChildren(h('option', { value: '' }, '請選擇…'), ...opts);
  }
  sel.value = selected || '';
}

function openEditor({ fp = null, country = null } = {}) {
  editor.fp = fp;
  editor.removed = [];
  editor.photos = (fp?.photoIds || []).map((id) => ({ id, existing: true }));
  editor.lat = fp?.lat ?? null;
  editor.lng = fp?.lng ?? null;
  $('#editor-title').textContent = fp ? '編輯足跡' : '新增足跡';
  fillCountrySelect(fp?.country || country);
  $('#editor-place').value = fp?.title || '';
  $('#editor-date').value = fp?.date || '';
  $('#editor-story').value = fp?.story || '';
  renderEditorPhotos();
  renderEditorLoc();
  $('#editor').showModal();
  $('#editor .modal-body').scrollTop = 0;
}

function renderEditorPhotos() {
  const grid = $('#editor-photos');
  const add = grid.querySelector('.photo-add');
  grid.replaceChildren(
    ...editor.photos.map((p, i) => {
      const img = p.url ? h('img', { src: p.url, alt: '' }) : lazyImg(p.id, '');
      return h(
        'div',
        { class: 'photo-thumb' },
        img,
        i === 0 ? h('span', { class: 'cover-tag' }, '封面') : null,
        h('button', { type: 'button', class: 'photo-remove', 'aria-label': '移除照片', onclick: () => removeEditorPhoto(i) }, '×'),
        i > 0 ? h('button', { type: 'button', class: 'photo-cover', onclick: () => makeCover(i) }, '設為封面') : null,
      );
    }),
    ...Array.from({ length: editor.busy }, () => h('div', { class: 'photo-thumb loading' }, h('span', { class: 'spinner' }))),
    add,
  );
}

function removeEditorPhoto(i) {
  const [p] = editor.photos.splice(i, 1);
  if (p.existing) editor.removed.push(p.id);
  else URL.revokeObjectURL(p.url);
  renderEditorPhotos();
}

function makeCover(i) {
  const [p] = editor.photos.splice(i, 1);
  editor.photos.unshift(p);
  renderEditorPhotos();
}

function renderEditorLoc() {
  const has = Number.isFinite(editor.lat);
  $('#editor-loc').textContent = has ? `📍 ${editor.lat.toFixed(4)}, ${editor.lng.toFixed(4)}` : '尚未設定';
  $('#editor-loc').classList.toggle('muted', !has);
  $('#editor-loc-clear').hidden = !has;
  $('#editor-pick').textContent = has ? '重新選擇' : '在地圖上選擇';
}

async function addEditorFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!list.length) return;
  editor.busy += list.length;
  renderEditorPhotos();
  let located = false;
  let failed = 0;
  for (const file of list) {
    try {
      const data = await processPhoto(file);
      const id = db.uid();
      editor.photos.push({ id, existing: false, url: URL.createObjectURL(data.thumb), data: { id, ...data } });
      if (Number.isFinite(data.lat) && !Number.isFinite(editor.lat)) {
        editor.lat = data.lat;
        editor.lng = data.lng;
        located = true;
        const code = map.countryAt(data.lat, data.lng);
        if (code && !$('#editor-country').value) $('#editor-country').value = code;
      }
      if (data.takenAt && !$('#editor-date').value) $('#editor-date').value = toDateInput(data.takenAt);
    } catch (err) {
      console.error(err);
      failed++;
    }
    editor.busy--;
    renderEditorPhotos();
  }
  renderEditorLoc();
  if (failed) toast(`${failed} 張照片無法讀取（可能是格式不支援）`);
  else if (located) toast('已從照片讀到位置 📍');
}

async function saveEditor() {
  if (editor.busy) {
    toast('照片還在處理中，請稍候');
    return;
  }
  const country = $('#editor-country').value;
  const title = $('#editor-place').value.trim();
  if (!country) {
    toast('請選擇國家');
    $('#editor-country').focus();
    return;
  }
  if (!title) {
    toast('請填寫地點或標題');
    $('#editor-place').focus();
    return;
  }
  const now = Date.now();
  const fp = {
    ...(editor.fp || { id: db.uid(), createdAt: now }),
    country,
    title,
    date: $('#editor-date').value || '',
    story: $('#editor-story').value.trim(),
    lat: editor.lat,
    lng: editor.lng,
    photoIds: editor.photos.map((p) => p.id),
  };
  const newPhotos = editor.photos.filter((p) => !p.existing).map((p) => p.data);
  const $save = $('#editor-save');
  $save.disabled = true;
  try {
    await db.saveFootprint(fp, newPhotos, editor.removed);
  } catch (err) {
    console.error(err);
    toast(err?.name === 'QuotaExceededError' ? '裝置空間不足，無法儲存' : '儲存失敗，請再試一次');
    return;
  } finally {
    $save.disabled = false;
  }
  editor.removed.forEach(forgetPhoto);
  for (const p of editor.photos) if (!p.existing) URL.revokeObjectURL(p.url);
  requestPersist();
  $('#editor').close();
  const isNew = !editor.fp;
  await reload();
  if (state.view === 'map') {
    openSheet(country);
    if (isNew) {
      if (Number.isFinite(fp.lat)) map.focusPoint(fp.lat, fp.lng);
      else map.focusCountry(country);
    }
  }
  if ($('#viewer').open) openViewer(fp.id);
  toast(isNew ? `已留下足跡：${title}` : '已更新');
}

function discardEditor() {
  for (const p of editor.photos) if (!p.existing) URL.revokeObjectURL(p.url);
  editor.photos = [];
  $('#editor').close();
}

function startPick() {
  $('#editor').close();
  $('#viewer').close();
  showView('map');
  closeSheetVisualOnly();
  $('#pick-banner').hidden = false;
  map.startPick(({ lat, lng, country }) => {
    $('#pick-banner').hidden = true;
    editor.lat = lat;
    editor.lng = lng;
    if (country && country !== $('#editor-country').value) {
      $('#editor-country').value = country;
      toast(`國家已設為 ${nameOf(country)}`);
    }
    renderEditorLoc();
    restoreSheet();
    $('#editor').showModal();
  });
}

function cancelPick() {
  map.cancelPick();
  $('#pick-banner').hidden = true;
  restoreSheet();
  $('#editor').showModal();
}

// 選位置時暫時收起面板，但保留目前查看的國家
function closeSheetVisualOnly() {
  $('#sheet').classList.remove('open');
}
function restoreSheet() {
  if (state.sheetCountry) $('#sheet').classList.add('open');
}

// ---------- 設定 / 備份 ----------

async function requestPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* 不支援 */ }
}

async function showStorageInfo() {
  const el = $('#storage-info');
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.textContent = `已使用 ${mb(usage)}，可用空間約 ${mb(quota)}。${persisted ? '已啟用永久儲存。' : ''}`;
  } catch {
    el.textContent = '';
  }
}

async function exportBackup() {
  const btn = $('#export-btn');
  btn.disabled = true;
  btn.textContent = '匯出中…';
  try {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `足跡地圖備份-${toDateInput(Date.now())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('備份檔已下載');
  } catch (err) {
    console.error(err);
    toast('匯出失敗');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ 匯出備份檔';
  }
}

async function importBackup(file) {
  if (!file) return;
  if (!confirm('還原會「取代」目前所有資料，確定要繼續嗎？')) return;
  try {
    const data = JSON.parse(await file.text());
    await db.importAll(data);
    thumbCache.forEach((url) => URL.revokeObjectURL(url));
    thumbCache.clear();
    closeSheet();
    await reload();
    toast(`已還原 ${data.footprints?.length || 0} 個足跡`);
    $('#settings').close();
  } catch (err) {
    console.error(err);
    toast(err.message?.includes('備份檔') ? err.message : '無法讀取這個備份檔');
  }
}

async function clearData() {
  if (!confirm('確定要刪除所有國家、足跡和照片嗎？此動作無法復原。')) return;
  await db.clearAll();
  thumbCache.forEach((url) => URL.revokeObjectURL(url));
  thumbCache.clear();
  closeSheet();
  await reload();
  $('#settings').close();
  toast('已清除所有資料');
}

// ---------- 事件綁定 ----------

function bind() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#stat-pill').addEventListener('click', () => showView('stats'));
  $('#settings-btn').addEventListener('click', () => {
    showStorageInfo();
    $('#settings').showModal();
  });

  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-add').addEventListener('click', () => openEditor({ country: state.sheetCountry }));
  document.querySelectorAll('#sheet-status button').forEach((b) =>
    b.addEventListener('click', () => setStatus(state.sheetCountry, b.dataset.status)),
  );
  $('#fab').addEventListener('click', () => openEditor({ country: state.sheetCountry }));
  $('#map-reset').addEventListener('click', () => {
    closeSheet();
    map.resetView();
  });
  $('#pick-cancel').addEventListener('click', cancelPick);

  // 對話框：點背景或「取消」關閉
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d && d.id !== 'editor') d.close();
    });
    d.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => (d.id === 'editor' ? discardEditor() : d.close())),
    );
  });
  $('#lightbox').addEventListener('click', () => $('#lightbox').close());

  $('#editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditor();
  });
  $('#editor').addEventListener('cancel', (e) => {
    e.preventDefault();
    discardEditor();
  });
  $('#editor-file').addEventListener('change', (e) => {
    addEditorFiles(e.target.files);
    e.target.value = '';
  });
  $('#editor-pick').addEventListener('click', startPick);
  $('#editor-loc-clear').addEventListener('click', () => {
    editor.lat = editor.lng = null;
    renderEditorLoc();
  });

  $('#viewer-edit').addEventListener('click', () => {
    const fp = state.footprints.find((f) => f.id === viewingId);
    if (fp) openEditor({ fp });
  });
  $('#viewer-delete').addEventListener('click', async () => {
    const fp = state.footprints.find((f) => f.id === viewingId);
    if (!fp || !confirm(`確定要刪除「${fp.title}」嗎？照片也會一起刪除。`)) return;
    await db.deleteFootprint(fp);
    (fp.photoIds || []).forEach(forgetPhoto);
    $('#viewer').close();
    await reload();
    toast('已刪除');
  });
  $('#viewer-locate').addEventListener('click', () => {
    const fp = state.footprints.find((f) => f.id === viewingId);
    if (!fp) return;
    $('#viewer').close();
    showView('map');
    openSheet(fp.country);
    map.focusPoint(fp.lat, fp.lng);
  });

  $('#country-search').addEventListener('input', renderCountryList);
  document.querySelectorAll('#country-filter .chip').forEach((c) =>
    c.addEventListener('click', () => {
      state.countryFilter = c.dataset.filter;
      document.querySelectorAll('#country-filter .chip').forEach((x) => x.classList.toggle('active', x === c));
      renderCountryList();
    }),
  );

  $('#export-btn').addEventListener('click', exportBackup);
  $('#import-file').addEventListener('change', (e) => {
    importBackup(e.target.files[0]);
    e.target.value = '';
  });
  $('#clear-btn').addEventListener('click', clearData);
}

// ---------- 啟動 ----------

async function start() {
  bind();
  try {
    map = await createMap($('#map'), {
      onCountryClick: (code) => openSheet(code),
      onPinClick: (id) => openViewer(id),
    });
    allCodes = map.codes.filter((c) => c !== 'AQ').concat('AQ');
  } catch (err) {
    console.error(err);
    $('#map-loading').textContent = '地圖載入失敗，請重新整理';
    return;
  }
  $('#map-loading').remove();
  await reload();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker 註冊失敗', err));
  }
}

start();
