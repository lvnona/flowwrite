package ca.u11.flowwrite.data

/**
 * Snapshot of the Firestore users/{uid} document, shaped for the UI.
 * Matches the schema written by both the Electron desktop app (usageTracking.js)
 * and the PHP mobile proxy (mobile-generate.php / mobile-transcribe.php) so that
 * weekly quotas are unified across devices.
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
)
