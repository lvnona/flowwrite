package ca.u11.flowwrite.data

/**
 * A template stored in Firestore [users/{uid}/templates/{id}].
 * Schema matches the Electron desktop app's useTemplates.js exactly so
 * templates created on desktop appear immediately on mobile.
 *
 * Firestore fields:
 *   name      String  — display name shown in the list
 *   purpose   String  — category tag ("Email", "Social", "Work", "Other", …)
 *   platform  String  — optional platform hint (e.g. "LinkedIn", "Gmail")
 *   content   String  — full template text / AI prompt
 *   fromName  String  — optional sender name (used in email templates)
 *   signature String  — optional email signature
 *   notes     String  — optional private notes
 *   updatedAt Long    — epoch-ms; list is sorted newest-first by this field
 *   createdAt Long    — epoch-ms
 */
data class Template(
    val id: String = "",
    val name: String = "",
    val purpose: String = "",
    val platform: String = "",
    val content: String = "",
    val fromName: String = "",
    val signature: String = "",
    val notes: String = "",
    val updatedAt: Long = 0L,
    val createdAt: Long = 0L,
)
