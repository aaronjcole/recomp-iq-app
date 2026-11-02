// On-device progress photo storage. No uploads — photos live in IndexedDB.
// Pure-ish storage module: addPhoto, listPhotos, getPhotoBlob, deletePhoto,
// deletePhotosForUser, estimateUsage.

// Renaming this database would orphan existing on-device photos.
const DB_NAME = "recompiq_progress_photos";
const STORE = "photos";
const DB_VERSION = 1;

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// One shared connection per page. It is dropped (and reopened on next use) when
// another tab upgrades or deletes the database, or the browser closes it.
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  const pending = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const forget = () => {
        if (dbPromise === pending) dbPromise = null;
      };
      db.onversionchange = () => {
        forget();
        db.close();
      };
      db.onclose = forget;
      resolve(db);
    };
    req.onerror = () => {
      if (dbPromise === pending) dbPromise = null;
      reject(req.error || new Error("Storage unavailable"));
    };
  });
  dbPromise = pending;
  return pending;
}

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Walk only this user's records through the userId index, keeping metadata.
async function eachUserRecord(userId, visit) {
  if (!userId) return;
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const request = store(db, "readonly").index("userId").openCursor(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      visit(meta(cursor.value));
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("Could not read progress photos"));
  });
}

export function sortPhotosNewestFirst(photos) {
  return [...photos].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export function photoUsageBytes(photos) {
  return photos.reduce((sum, p) => sum + (Number(p?.sizeBytes) || 0), 0);
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to Image */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

async function compress(file, maxDim, quality) {
  const bmp = await loadBitmap(file);
  const srcW = bmp.naturalWidth || bmp.width;
  const srcH = bmp.naturalHeight || bmp.height;
  const scale = Math.min(1, maxDim / Math.max(srcW || 1, srcH || 1));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality
    );
  });
}

export function meta(record) {
  const { fullBlob, thumbBlob, ...rest } = record;
  return rest;
}

export async function addPhoto(userId, file, opts = {}) {
  if (!userId) throw new Error("Missing user");
  if (!file) throw new Error("No file");

  const [fullBlob, thumbBlob] = await Promise.all([
    compress(file, 1600, 0.82),
    compress(file, 360, 0.7)
  ]);

  const record = {
    id: genId(),
    userId,
    date: opts.date || todayStr(),
    weight_lbs: opts.weight_lbs ?? null,
    pose: opts.pose || null,
    note: opts.note || "",
    fullBlob,
    thumbBlob,
    fullType: fullBlob.type,
    thumbType: thumbBlob.type,
    sizeBytes: fullBlob.size + thumbBlob.size,
    created_at: Date.now()
  };

  const db = await openDB();
  try {
    await reqPromise(store(db, "readwrite").add(record));
  } catch (err) {
    if (err && err.name === "QuotaExceededError") {
      throw new Error("Out of storage — free space on this device to add more photos.");
    }
    throw err;
  }
  return meta(record);
}

export async function listPhotos(userId) {
  const photos = [];
  await eachUserRecord(userId, (photo) => photos.push(photo));
  return sortPhotosNewestFirst(photos);
}

export async function getPhotoBlob(id, kind = "full") {
  const db = await openDB();
  const rec = await reqPromise(store(db, "readonly").get(id));
  if (!rec) return null;
  return kind === "thumb" ? rec.thumbBlob : rec.fullBlob;
}

export async function deletePhoto(id) {
  const db = await openDB();
  await reqPromise(store(db, "readwrite").delete(id));
}

export async function deletePhotosForUser(userId) {
  if (!userId) return 0;
  const db = await openDB();

  return await new Promise((resolve, reject) => {
    let deleted = 0;
    const tx = db.transaction(STORE, "readwrite");
    const photoStore = tx.objectStore(STORE);
    const request = photoStore.index("userId").openCursor(IDBKeyRange.only(userId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      deleted += 1;
      cursor.continue();
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => {
      reject(tx.error || request.error || new Error("Could not delete progress photos"));
    };
    tx.onabort = () => {
      reject(tx.error || request.error || new Error("Could not delete progress photos"));
    };
  });
}

// Bytes used by this user's photos only (other accounts on the device excluded).
export async function estimateUsage(userId) {
  let bytes = 0;
  await eachUserRecord(userId, (photo) => {
    bytes += Number(photo.sizeBytes) || 0;
  });
  return bytes;
}
