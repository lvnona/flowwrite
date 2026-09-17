// Stripe billing endpoints (PHP on the host at flowwrite.u11.ca).
//
// The desktop app opens these URLs in the user's browser. The PHP backend
// creates the Stripe Checkout session (upgrade) or Customer Portal session
// (manage/cancel), tying it to the Firebase uid so the webhook can flip the
// user's plan after payment. See admin-web/public/*.php.

const SITE = 'https://flowwrite.u11.ca';

/**
 * Where "Upgrade to Pro" sends the user — creates a Stripe Checkout session.
 * Takes a fresh Firebase ID token (not a raw uid) so the server verifies who's
 * asking instead of trusting a client-supplied value.
 */
export function checkoutUrl(idToken, email) {
  const q = new URLSearchParams({ token: idToken || '', email: email || '' });
  return `${SITE}/create-checkout.php?${q.toString()}`;
}

/** Where "Manage subscription" sends the user — Stripe Customer Portal. */
export function portalUrl(idToken) {
  const q = new URLSearchParams({ token: idToken || '' });
  return `${SITE}/billing-portal.php?${q.toString()}`;
}

/**
 * Where "Edit online" / "Customer portal" sends the user — the web SPA at
 * /app.html. Customers can manage their templates, see their stats and access
 * billing from any device (phone, tablet, friend's laptop) without needing the
 * desktop installed.
 */
export function customerPortalUrl() {
  return `${SITE}/app.html`;
}
