// Unified templates — now synced to the user's account (Firestore), so they
// follow you across devices. Stored at users/{uid}/templates/{id} and streamed
// live via onSnapshot.
//
// One-time migration: the first time a signed-in user has an empty cloud
// collection, any templates still in the local (electron-store) collection are
// uploaded, then a per-device flag prevents re-uploading.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../utils/firebase.js';
import { isConfigured } from '../utils/firebaseConfig.js';

function templatesCol() {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!uid || !isConfigured()) return null;
  return collection(getFirebaseFirestore(), 'users', uid, 'templates');
}

function newId() {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const migratedRef = useRef(false);

  useEffect(() => {
    const col = templatesCol();
    if (!col) { setLoading(false); return undefined; }

    const unsub = onSnapshot(
      col,
      async (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setTemplates(list);
        setLoading(false);

        // One-time local → cloud migration (only when cloud is still empty).
        if (!migratedRef.current && snap.empty) {
          migratedRef.current = true;
          try {
            if (localStorage.getItem('fw_tpl_cloud_migrated')) return;
            const local = (await window.flowwrite?.getTemplates?.()) || [];
            if (local.length) {
              await Promise.all(local.map((t) => {
                const id = t.id || newId();
                return setDoc(doc(col, id), { ...t, id, updatedAt: t.updatedAt || Date.now() }, { merge: true });
              }));
            }
            localStorage.setItem('fw_tpl_cloud_migrated', '1');
          } catch { /* non-fatal */ }
        }
      },
      () => {
        // Cloud read failed (e.g. the templates security rule isn't deployed
        // yet) — fall back to the local copy so nothing appears to vanish.
        setLoading(false);
        window.flowwrite?.getTemplates?.().then((local) => {
          if (Array.isArray(local) && local.length) {
            setTemplates(local.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
          }
        }).catch(() => {});
      },
    );
    return () => unsub();
  }, []);

  // Upsert — pass an object without `id` to create, or with `id` to update.
  const save = useCallback(async (template) => {
    const col = templatesCol();
    if (!col) return templates;
    const now = Date.now();
    const id = template.id || newId();
    const data = {
      name: '', purpose: 'Other', platform: '', content: '',
      fromName: '', signature: '', notes: '',
      ...template,
      id,
      updatedAt: now,
      createdAt: template.createdAt || now,
    };
    await setDoc(doc(col, id), data, { merge: true });
    return templates; // live state updates via onSnapshot
  }, [templates]);

  const remove = useCallback(async (id) => {
    const col = templatesCol();
    if (!col) return templates;
    await deleteDoc(doc(col, id));
    return templates;
  }, [templates]);

  // No-op kept for API compatibility — onSnapshot already keeps state live.
  const refresh = useCallback(() => {}, []);

  return { templates, loading, refresh, save, remove };
}
