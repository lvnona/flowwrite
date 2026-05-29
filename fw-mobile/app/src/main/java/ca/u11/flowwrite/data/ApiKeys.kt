package ca.u11.flowwrite.data

/**
 * Mirror of the Firestore document at config/apiKeys — the same document that
 * the Electron desktop app reads via onSnapshot in App.jsx.
 *
 * The admin sets these once in the Admin panel; every client (desktop + mobile)
 * picks them up automatically. Keys are never stored in the APK binary.
 */
data class ApiKeys(
    /** Which AI to use for text generation: "claude" | "openai" | "deepseek" */
    val popupProvider: String = "claude",

    // ── Anthropic ────────────────────────────────────────────────────────────
    val anthropic: String = "",

    // ── OpenAI (popup generation) ────────────────────────────────────────────
    val openaiPopup: String = "",
    val openaiPopupModel: String = "gpt-4o",

    // ── DeepSeek (OpenAI-compatible) ─────────────────────────────────────────
    val deepseek: String = "",
    val deepseekModel: String = "deepseek-v4-flash",

    // ── OpenAI (Whisper transcription + dictation polish) ────────────────────
    val openai: String = "",
) {
    val isConfigured: Boolean
        get() = when (popupProvider) {
            "claude"   -> anthropic.isNotBlank()
            "deepseek" -> deepseek.isNotBlank()
            else       -> openaiPopup.isNotBlank()
        } && openai.isNotBlank()
}
