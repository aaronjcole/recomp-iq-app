// On-device progress photo storage. No uploads — photos live in IndexedDB.
// Pure-ish storage module: addPhoto, listPhotos, getPhotoBlob, deletePhoto, estimateUsage.

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

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Storage unavailable"));
  });
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

function meta(record) {
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
  const db = await openDB();
  const all = (await reqPromise(store(db, "readonly").getAll())) || [];
  return all
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .map(meta);
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

export async function estimateUsage() {
  const db = await openDB();
  const all = (await reqPromise(store(db, "readonly").getAll())) || [];
  return all.reduce((sum, p) => sum + (p.sizeBytes || 0), 0);
}