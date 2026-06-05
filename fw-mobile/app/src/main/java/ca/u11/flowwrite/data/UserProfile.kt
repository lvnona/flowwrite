package ca.u11.flowwrite.data

/**
 * Snapshot of the Firestore users/{uid} document, shaped for the UI.
 * The server proxy writes these fields (plan, weekly/all-time usage); the app
 * only reads them for display, so quotas stay unified across all devices.
 */
data class UserProfile(
    val uid: String,
    val email: String,
    val plan: String = "free",              // "free" | "pro" | "team"
    /** Set by the server's Stripe webhook: "active" | "trialing" | "canceled" | "past_due" | … */
    val subscriptionStatus: String = "",
    val popupProvider: String = "openai",   // "openai" | "anthropic" | "deepseek"
    /** Count of AI generation calls in the current ISO week. */
    val generationsThisWeek: Int = 0,
    /** Count of audio words transcribed in the current ISO week. */
    val audioWordsThisWeek: Int = 0,
    val allTimeUsage: Int = 0,
    val allTimeAudioWords: Int = 0,
) {
    /** Paid plans (unlimited usage). Free is everything else. */
    val isPro: Boolean get() = plan == "pro" || plan == "team"
}
