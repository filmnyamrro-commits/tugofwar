export interface StoredAudioClip {
  name: string;
  dataUrl: string;
}

const DB_NAME = 'tugofwar_media_v1';
const STORE_NAME = 'audio_clips';
const WINNER_AUDIO_KEY = 'winner_congrats_audio';
const LEGACY_LS_KEY = 'ropesum_congrats_audio_v1';

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open audio storage'));
  });
}

export async function loadWinnerCongratsAudio(): Promise<StoredAudioClip | null> {
  try {
    const db = await openAudioDb();
    const fromIdb = await new Promise<StoredAudioClip | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(WINNER_AUDIO_KEY);
      req.onsuccess = () => {
        const val = req.result as Partial<StoredAudioClip> | undefined;
        if (val && typeof val.dataUrl === 'string' && val.dataUrl.startsWith('data:')) {
          resolve({
            name: typeof val.name === 'string' && val.name ? val.name : 'Custom Winner Audio',
            dataUrl: val.dataUrl,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
    if (fromIdb) return fromIdb;
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAudioClip>;
    if (typeof parsed.dataUrl === 'string' && parsed.dataUrl.startsWith('data:')) {
      return {
        name:
          typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Custom Winner Audio',
        dataUrl: parsed.dataUrl,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

export async function saveWinnerCongratsAudio(
  clip: StoredAudioClip | null
): Promise<boolean> {
  let savedIdb = false;
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (clip) {
        store.put(clip, WINNER_AUDIO_KEY);
      } else {
        store.delete(WINNER_AUDIO_KEY);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save audio'));
    });
    savedIdb = true;
  } catch {
    savedIdb = false;
  }

  try {
    if (clip) {
      if (!savedIdb || clip.dataUrl.length < 1_500_000) {
        localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(clip));
      } else {
        localStorage.removeItem(LEGACY_LS_KEY);
      }
    } else {
      localStorage.removeItem(LEGACY_LS_KEY);
    }
    return true;
  } catch {
    return savedIdb;
  }
}
