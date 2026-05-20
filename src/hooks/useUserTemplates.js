// Read / save / delete user-defined style templates via the IPC bridge.
// User templates are few-shot examples Claude uses as the style gold-standard.

import { useCallback, useEffect, useState } from 'react';

export function useUserTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = (await window.flowwrite?.getUserTemplates?.()) || [];
    setTemplates(list);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Upsert — pass an object without `id` to create, or with `id` to update.
  const save = useCallback(async (template) => {
    const list = (await window.flowwrite?.saveUserTemplate?.(template)) || [];
    setTemplates(list);
    return list;
  }, []);

  const remove = useCallback(async (id) => {
    const list = (await window.flowwrite?.deleteUserTemplate?.(id)) || [];
    setTemplates(list);
    return list;
  }, []);

  return { templates, loading, refresh, save, remove };
}

/**
 * Best-effort: find the user template whose platform matches the active app.
 * "Matches" means case-insensitive substring overlap in either direction
 * (so "Facebook" template matches "Facebook" app and vice versa).
 */
export function findUserTemplateForApp(templates, appName) {
  if (!templates?.length || !appName) return null;
  const app = appName.toLowerCase();
  return (
    templates.find((t) => {
      const p = (t.platform || '').toLowerCase().trim();
      if (!p) return false;
      return app.includes(p) || p.includes(app);
    }) || null
  );
}
