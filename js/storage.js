/* =====================================================================
   storage.js — saving things on the iPad.

   Two kinds of saving:
   1. IndexedDB (a small database built into Safari) holds the big things:
        - "photos":  photos she added (shrunk to a sensible size)
        - "puzzles": every puzzle's progress (where each piece is)
   2. localStorage holds tiny settings, like "sound on" and the last
      piece count she picked.

   Nothing here ever leaves the iPad. There is no internet code at all.
   ===================================================================== */

const Store = (() => {
  const DB_NAME = 'grammys-puzzles';
  const DB_VERSION = 1;
  let dbPromise = null;

  /** Opens the database (creating it the very first time). */
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('puzzles')) db.createObjectStore('puzzles', { keyPath: 'pictureId' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  /** Runs one database action and waits for it to finish. */
  async function run(storeName, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ---------- Puzzles (progress) ----------
  const getPuzzle = (pictureId) => run('puzzles', 'readonly', (s) => s.get(pictureId));
  const getAllPuzzles = () => run('puzzles', 'readonly', (s) => s.getAll());
  const putPuzzle = (record) => run('puzzles', 'readwrite', (s) => s.put(record));
  const deletePuzzle = (pictureId) => run('puzzles', 'readwrite', (s) => s.delete(pictureId));

  // ---------- Photos she added ----------
  // Photos are stored as raw bytes (ArrayBuffer) which is the most reliable
  // format for Safari's database.
  const getPhoto = (id) => run('photos', 'readonly', (s) => s.get(id));
  const getAllPhotos = () => run('photos', 'readonly', (s) => s.getAll());
  const putPhoto = (record) => run('photos', 'readwrite', (s) => s.put(record));
  const deletePhoto = (id) => run('photos', 'readwrite', (s) => s.delete(id));

  // ---------- Small settings ----------
  function getPref(name, fallback) {
    try {
      const raw = localStorage.getItem('pref:' + name);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function setPref(name, value) {
    try { localStorage.setItem('pref:' + name, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /** Asks Safari to keep our saved data safe and not clear it to free space. */
  function askToKeepData() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) { /* not supported, that's fine */ }
  }

  return {
    getPuzzle, getAllPuzzles, putPuzzle, deletePuzzle,
    getPhoto, getAllPhotos, putPhoto, deletePhoto,
    getPref, setPref, askToKeepData,
  };
})();
