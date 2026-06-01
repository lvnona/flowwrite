package ca.u11.flowwrite.data

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Opens the FlowWrite web portal (`flowwrite.u11.ca/app.html`) in Chrome
 * Custom Tabs so the Google session cookie + sign-in flow are preserved.
 *
 * The portal mirrors the mobile app's functionality on a bigger screen:
 * full template manager (with the new "Additional Instructions" field),
 * usage stats, and Stripe subscription management. Templates round-trip via
 * Firestore so edits made on the portal appear in the app within seconds.
 *
 * Never use a WebView for this — it loses the Google sign-in cookies.
 */
object WebPortal {

    const val URL = "https://flowwrite.u11.ca/app.html"

    fun open(context: Context) {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
            .launchUrl(context, Uri.parse(URL))
    }
}
