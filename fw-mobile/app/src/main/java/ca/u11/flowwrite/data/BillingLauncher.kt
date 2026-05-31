package ca.u11.flowwrite.data

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import java.net.URLEncoder

/**
 * Opens the FlowWrite billing endpoints (hosted by flowwrite.u11.ca) in Chrome
 * Custom Tabs.  This is the ONLY code path that touches billing — the mobile
 * app never talks to Stripe directly and ships no Stripe key/price ID.
 *
 * Plan status is read live from Firestore (`users/{uid}.plan` +
 * `subscriptionStatus`); the server's Stripe webhook flips those fields, so
 * the app reacts automatically via the existing snapshot listener.
 *
 * Endpoints (per the spec):
 *   - $BASE/create-checkout.php?uid=<UID>&email=<URL_ENCODED_EMAIL>
 *   - $BASE/billing-portal.php?uid=<UID>
 */
object BillingLauncher {

    private const val BASE = "https://flowwrite.u11.ca"

    /** Open Stripe Checkout (subscribe to Pro). */
    fun openCheckout(context: Context, uid: String, email: String) {
        val emailEnc = URLEncoder.encode(email, Charsets.UTF_8.name())
        launch(context, "$BASE/create-checkout.php?uid=$uid&email=$emailEnc")
    }

    /** Open the Stripe Customer Portal (manage / cancel / invoices). */
    fun openBillingPortal(context: Context, uid: String) {
        launch(context, "$BASE/billing-portal.php?uid=$uid")
    }

    private fun launch(context: Context, url: String) {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
            .launchUrl(context, Uri.parse(url))
    }
}
