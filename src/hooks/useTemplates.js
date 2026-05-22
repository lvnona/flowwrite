// Read / save / delete unified templates via the IPC bridge.
//
// One collection for every template kind. Each item has a `purpose` (matching a
// popup Content type) and an optional `platform`. Email-purpose templates also
// carry fromName + signature; other purposes use `content` as a style example.

import { useCallback, useEffect, useState } from 'react';

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = (await window.flowwrite?.getTemplates?.()) || [];
    setTemplates(list);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Upsert — pass an object without `id` to create, or with `id` to update.
  const save = useCallback(async (template) => {
    const list = (await window.flowwrite?.saveTemplate?.(template)) || [];
    setTemplates(list);
    return list;
  }, []);

  const remove = useCallback(async (id) => {
    const list = (await window.flowwrite?.deleteTemplate?.(id)) || [];
    setTemplates(list);
    return list;
  }, []);

  return { templates, loading, refresh, save, remove };
}
