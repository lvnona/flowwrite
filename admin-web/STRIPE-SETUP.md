# FlowWrite — Stripe subscription setup

The app + webhook code is already built. To go live you (1) create the Stripe
product, (2) drop the service-account key + config on the host, and (3) register
the webhook. No Composer / SDK needed — the PHP is dependency-free.

## What's already built
- **In-app limits** (free tier): `50 AI generations/week` + `2,500 dictated words/week`,
  enforced in the desktop app's main process. Pro/Team = unlimited. Resets every
  Monday automatically.
- **Upgrade prompts**: popup shows "Upgrade to Pro" when a free user hits a limit;
  Dashboard shows a Plan panel with usage bars + Upgrade / Manage buttons.
- **PHP backend** (`admin-web/public/`):
  - `create-checkout.php` — starts Stripe Checkout (subscription) for a uid
  - `stripe-webhook.php` — flips Firestore `plan` on payment events
  - `billing-portal.php` — opens the Stripe Customer Portal (update card / cancel)
  - `_firebase.php`, `_stripe-config.php` — helpers (not web-accessible)

## One-time setup

### 1. Stripe (test mode first)
1. Create a Stripe account → stay in **Test mode**.
2. **Products → Add product** "FlowWrite Pro" with a **recurring monthly Price**.
   Copy the **Price ID** (`price_…`).
3. **Developers → API keys**: copy the **Secret key** (`sk_test_…`).

### 2. Firebase service account
1. Firebase Console → **Project settings → Service accounts → Generate new private key**.
2. Upload that JSON to the server **outside `public_html`** (e.g. `/home/USER/secure/`).

### 3. Config on the server
1. Copy `_stripe-config.sample.php` → `_stripe-config.php` (same folder).
2. Fill in: `stripe_secret_key`, `stripe_price_id`, `service_account_path`,
   and (after step 4) `stripe_webhook_secret`.

### 4. Webhook
1. Stripe → **Developers → Webhooks → Add endpoint**:
   `https://flowwrite.u11.ca/stripe-webhook.php`
2. Select events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
3. Copy the endpoint's **Signing secret** (`whsec_…`) into `_stripe-config.php`.

### 5. Test
- In the app: Dashboard → **Upgrade to Pro** → pay with test card `4242 4242 4242 4242`.
- Confirm Firestore `users/{uid}.plan` flips to `pro` and the app unlocks.
- In Stripe (or the Customer Portal) **cancel** → confirm it flips back to `free`.

### 6. Go live
- Swap to **live** keys (`sk_live_…`, live `price_…`) and a **live** webhook + secret.

## How downgrade works
The webhook maps subscription status → plan:
- `active` / `trialing` → **pro**
- `canceled` / `unpaid` / `past_due` (declined or cancelled) → **free**

So a declined payment or a cancellation automatically returns the user to Free.
