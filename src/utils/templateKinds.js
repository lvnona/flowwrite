// Shared metadata for templates.
//
// A template's `purpose` lines up with the popup's Content type, so the popup
// can show "templates for what you're writing right now" by matching strings.
// `platform` is an optional app/site tag used for filtering + auto-selection.

// Purposes line up 1:1 with the popup Content types (minus Translate, which
// never uses a template). "Post" covers all social posts (filter by platform).
export const TEMPLATE_PURPOSES = [
  'Email',
  'Post',
  'Message',
  'Bio',
  'Description',
  'Note',
  'Other',
];

// '' = no platform (manual-select only / applies anywhere).
export const TEMPLATE_PLATFORMS = [
  '',
  'Facebook', 'Instagram', 'LinkedIn', 'Twitter', 'TikTok', 'YouTube', 'Reddit',
  'WhatsApp', 'Messages', 'Slack', 'Discord',
  'Gmail', 'Mail', 'Outlook',
  'Notion', 'Salesforce', 'HubSpot', 'Airbnb',
  'Other',
];

/** Best-effort: pick the template matching a content type + active app. */
export function autoPickTemplate(templates, purpose, appName) {
  if (!templates?.length) return null;
  const matches = templates.filter((t) => t.purpose === purpose);
  if (matches.length === 0) return null;
  const app = (appName || '').toLowerCase();
  // Prefer a platform match against the active app; otherwise no auto-pick.
  return (
    matches.find((t) => {
      const p = (t.platform || '').toLowerCase().trim();
      if (!p) return false;
      return app.includes(p) || p.includes(app);
    }) || null
  );
}
