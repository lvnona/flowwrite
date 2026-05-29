package ca.u11.flowwrite.data

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.temporal.WeekFields

/**
 * Firestore access for the users/{uid} document.
 *
 * - [userProfileFlow] — real-time listener (used by MainViewModel for the UI)
 * - [getProfile]      — one-shot read (used by MicService for limit checks)
 * - [incrementGeneration] / [incrementAudioWords] — atomic field increments
 *
 * Schema matches the Electron desktop app exactly so weekly quotas are
 * unified across all devices.
 */
class ProfileRepository {

    private val db = Firebase.firestore

    // -----------------------------------------------------------------------
    // Real-time listener
    // -----------------------------------------------------------------------

    fun userProfileFlow(uid: String): Flow<UserProfile> = callbackFlow {
        val weekKey = thisWeekKey()

        val listener = db.collection("users").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                if (snapshot == null || !snapshot.exists()) return@addSnapshotListener
                trySend(snapshot.toUserProfile(uid, weekKey))
            }

        awaitClose { listener.remove() }
    }

    // -----------------------------------------------------------------------
    // One-shot read (for pre-call limit checks in MicService)
    // -----------------------------------------------------------------------

    suspend fun getProfile(uid: String): UserProfile? {
        return try {
            val snap = db.collection("users").document(uid).get().await()
            if (snap.exists()) snap.toUserProfile(uid, thisWeekKey()) else null
        } catch (e: Exception) {
            null
        }
    }

    // -----------------------------------------------------------------------
    // Usage increments — atomic, same fields as the Electron app writes
    // -----------------------------------------------------------------------

    /**
     * Increments generation counters after a successful AI text generation.
     * Mirrors the Electron app's bumpGenerations() / usageTracking.js.
     */
    suspend fun incrementGeneration(uid: String) {
        val weekKey  = thisWeekKey()
        val monthKey = thisMonthKey()
        db.collection("users").document(uid).update(
            mapOf(
                "usageWeekly.$weekKey" to FieldValue.increment(1L),
                "usage.$monthKey"      to FieldValue.increment(1L),
                "allTimeUsage"         to FieldValue.increment(1L),
            )
        ).await()
    }

    /**
     * Increments audio-word counters after a successful Whisper transcription.
     * Mirrors the Electron app's bumpTranscriberStats().
     */
    suspend fun incrementAudioWords(uid: String, wordCount: Int) {
        val weekKey  = thisWeekKey()
        val monthKey = thisMonthKey()
        db.collection("users").document(uid).update(
            mapOf(
                "audioWordsWeekly.$weekKey" to FieldValue.increment(wordCount.toLong()),
                "audioWords.$monthKey"      to FieldValue.increment(wordCount.toLong()),
                "allTimeAudioWords"         to FieldValue.increment(wordCount.toLong()),
            )
        ).await()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * ISO-8601 week key in UTC — e.g. "2026-W21".
 * Year-of-Thursday, Mon–Sun weeks. Matches Electron's isoWeekKey().
 */
internal fun thisWeekKey(): String {
    val now = ZonedDateTime.now(ZoneOffset.UTC)
    val wf  = WeekFields.ISO
    return "%04d-W%02d".format(now.get(wf.weekBasedYear()), now.get(wf.weekOfWeekBasedYear()))
}

/** "2026-05" — for monthly usage buckets. */
internal fun thisMonthKey(): String =
    ZonedDateTime.now(ZoneOffset.UTC).let { "%04d-%02d".format(it.year, it.monthValue) }

@Suppress("UNCHECKED_CAST")
private fun DocumentSnapshot.toUserProfile(uid: String, weekKey: String): UserProfile {
    val usageWeekly = get("usageWeekly") as? Map<String, Any> ?: emptyMap()
    val audioWeekly = get("audioWordsWeekly") as? Map<String, Any> ?: emptyMap()
    return UserProfile(
        uid = uid,
        email = getString("email") ?: "",
        plan = getString("plan") ?: "free",
        popupProvider = getString("popupProvider") ?: "openai",
        generationsThisWeek = (usageWeekly[weekKey] as? Long)?.toInt() ?: 0,
        audioWordsThisWeek  = (audioWeekly[weekKey]  as? Long)?.toInt() ?: 0,
        allTimeUsage        = (getLong("allTimeUsage")        ?: 0L).toInt(),
        allTimeAudioWords   = (getLong("allTimeAudioWords")   ?: 0L).toInt(),
    )
}
