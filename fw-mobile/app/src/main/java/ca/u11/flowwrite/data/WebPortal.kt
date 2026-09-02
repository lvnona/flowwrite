package ca.u11.flowwrite.data

import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Opens a FlowWrite web page in a Chrome Custom Tab.
 *
 * Currently used only for the privacy policy link in `PrivacyScreen`
 * (https://flowwrite.u11.ca/privacy.html). The app deliberately has no links
 * to the account portal / pricing / checkout (Play consumption-only policy);
 * [URL] is kept as the default for possible future non-payment pages.
 *
 * Never use a WebView for this — it loses the Google sign-in cookies.
 */
object WebPortal {

    const val URL = "https://flowwrite.u11.ca/app.html"

    fun open(context: Context, url: String = URL) {
        runCatching {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(context, Uri.parse(url))
        }.onFailure {
            Toast.makeText(context, "No browser found", Toast.LENGTH_LONG).show()
        }
    }
}
