// Best-effort active-app classification used by the popup to pick defaults.
// The real detection happens in main (contextReader.js); this is only for
// renderer-side fallbacks when we want a label or icon for a known app.

const KNOWN = {
  gmail: { label: 'Gmail', kind: 'email' },
  mail: { label: 'Mail', kind: 'email' },
  outlook: { label: 'Outlook', kind: 'email' },
  salesforce: { label: 'Salesforce', kind: 'crm-note' },
  hubspot: { label: 'HubSpot', kind: 'crm-note' },
  notion: { label: 'Notion', kind: 'document' },
  linkedin: { label: 'LinkedIn', kind: 'professional-bio' },
  airbnb: { label: 'Airbnb', kind: 'listing-description' },
  slack: { label: 'Slack', kind: 'message' },
};

export function classifyApp(appName = '') {
  const lower = appName.toLowerCase();
  for (const key of Object.keys(KNOWN)) {
    if (lower.includes(key)) return KNOWN[key];
  }
  return { label: appName || 'Unknown', kind: 'general' };
}
