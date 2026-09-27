// IndexedDB 資料層：所有資料都存在使用者自己的裝置上
const DB_NAME = 'footprints';
const DB_VERSION = 1;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // { code, status: 'visited' | 'wish', updatedAt }
        db.createObjectStore('countries', { keyPath: 'code' });
        // { id, country, title, date, story, lat, lng, photoIds, createdAt, updatedAt }
        const fp = db.createObjectStore('footprints', { keyPath: 'id' });
        fp.createIndex('country', 'country');
        // { id, blob, thumb, lat, lng, takenAt }
        db.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(store) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).getAll());
}

async function get(store, key) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).get(key));
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const getCountries = () => getAll('countries');
export const getFootprints = () => getAll('footprints');
export const getPhoto = (id) => get('photos', id);

export async function setCountryStatus(code, status) {
  const db = await open();
  const tx = db.transaction('countries', 'readwrite');
  const store = tx.objectStore('countries');
  if (status) store.put({ code, status, updatedAt: Date.now() });
  else store.delete(code);
  await done(tx);
}

// 儲存足跡與新照片；removedPhotoIds 會一併刪除
export async function saveFootprint(fp, newPhotos = [], removedPhotoIds = []) {
  const db = await open();
  const tx = db.transaction(['footprints', 'photos', 'countries'], 'readwrite');
  const photos = tx.objectStore('photos');
  for (const p of newPhotos) photos.put(p);
  for (const id of removedPhotoIds) photos.delete(id);
  tx.objectStore('footprints').put({ ...fp, updatedAt: Date.now() });
  // 留下足跡就代表去過
  tx.objectStore('countries').put({ code: fp.country, status: 'visited', updatedAt: Date.now() });
  await done(tx);
}

export async function deleteFootprint(fp) {
  const db = await open();
  const tx = db.transaction(['footprints', 'photos'], 'readwrite');
  const photos = tx.objectStore('photos');
  for (const id of fp.photoIds || []) photos.delete(id);
  tx.objectStore('footprints').delete(fp.id);
  await done(tx);
}

// ---------- 備份 ----------

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const dataURLToBlob = (url) => fetch(url).then((r) => r.blob());

export async function exportAll() {
  const [countries, footprints, photos] = await Promise.all([
    getAll('countries'),
    getAll('footprints'),
    getAll('photos'),
  ]);
  const outPhotos = [];
  for (const p of photos) {
    outPhotos.push({
      ...p,
      blob: await blobToDataURL(p.blob),
      thumb: p.thumb ? await blobToDataURL(p.thumb) : null,
    });
  }
  return { app: 'footprints', version: 1, exportedAt: new Date().toISOString(), countries, footprints, photos: outPhotos };
}

export async function importAll(data) {
  if (data?.app !== 'footprints') throw new Error('這不是足跡地圖的備份檔');
  const photos = [];
  for (const p of data.photos || []) {
    photos.push({
      ...p,
      blob: await dataURLToBlob(p.blob),
      thumb: p.thumb ? await dataURLToBlob(p.thumb) : null,
    });
  }
  const db = await open();
  const tx = db.transaction(['countries', 'footprints', 'photos'], 'readwrite');
  for (const name of ['countries', 'footprints', 'photos']) tx.objectStore(name).clear();
  for (const c of data.countries || []) tx.objectStore('countries').put(c);
  for (const f of data.footprints || []) tx.objectStore('footprints').put(f);
  for (const p of photos) tx.objectStore('photos').put(p);
  await done(tx);
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['countries', 'footprints', 'photos'], 'readwrite');
  for (const name of ['countries', 'footprints', 'photos']) tx.objectStore(name).clear();
  await done(tx);
}
