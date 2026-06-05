package ca.u11.flowwrite.data

import android.util.Log
import com.google.firebase.auth.FirebaseUser
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
 * - [getProfile]      — one-shot read
 * - [ensureUserDoc]   — creates the doc on first sign-in
 *
 * Read-only with respect to usage: the server proxy writes all usage counters.
 * The app only reads them here for display.
 */
class ProfileRepository {

    private val db = Firebase.firestore

    private val TAG = "FwProfile"

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
    // First-sign-in / lifecycle — create the users/{uid} doc if missing
    // -----------------------------------------------------------------------

    /**
     * Ensures the [users/{uid}] document exists.  The Firestore CREATE rule
     * requires plan == "free" AND status == "active" — this writes exactly
     * that, plus profile fields and timestamps.
     *
     * Safe to call repeatedly: if the doc already exists, only [lastSeen] is
     * touched (which keeps plan / status / expiresAt unchanged, satisfying the
     * owner-update rule).
     *
     * Errors are logged but never thrown — the snapshot listener stays open
     * and will pick up the doc when it eventually lands.
     */
    suspend fun ensureUserDoc(user: FirebaseUser) {
        val ref = db.collection("users").document(user.uid)
        try {
            val snap = ref.get().await()
            if (!snap.exists()) {
                val data = mapOf(
                    "plan"        to "free",
                    "status"      to "active",
                    // expiresAt must EXIST on the doc — the owner-update rule
                    // compares request.resource.data.expiresAt == resource.data.expiresAt,
                    // which can fail when the field is missing on both sides.
                    // Stored as explicit null for free users; the backend sets
                    // a Timestamp when a Stripe subscription activates.
                    "expiresAt"   to null,
                    "email"       to (user.email ?: ""),
                    "displayName" to (user.displayName ?: ""),
                    "photoURL"    to (user.photoUrl?.toString() ?: ""),
                    "createdAt"   to FieldValue.serverTimestamp(),
                    "lastSeen"    to FieldValue.serverTimestamp(),
                )
                ref.set(data).await()
                Log.i(TAG, "Created users/${user.uid} (plan=free, status=active, expiresAt=null)")
            } else {
                ref.update("lastSeen", FieldValue.serverTimestamp()).await()
            }
        } catch (e: Exception) {
            Log.e(
                TAG,
                "ensureUserDoc PERMISSION_DENIED or write failed for ${user.uid} — " +
                    "check Firestore CREATE rule requires plan='free' AND status='active': ${e.message}",
                e,
            )
        }
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

    // NOTE: Usage counting is NOT done here anymore. The server proxy
    // (api-generate.php / api-transcribe.php) enforces limits and writes
    // usageWeekly / audioWordsWeekly / allTime* after each successful call.
    // The app only READS those fields (via [userProfileFlow]) for display.
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
        subscriptionStatus = getString("subscriptionStatus") ?: "",
        popupProvider = getString("popupProvider") ?: "openai",
        generationsThisWeek = (usageWeekly[weekKey] as? Long)?.toInt() ?: 0,
        audioWordsThisWeek  = (audioWeekly[weekKey]  as? Long)?.toInt() ?: 0,
        allTimeUsage        = (getLong("allTimeUsage")        ?: 0L).toInt(),
        allTimeAudioWords   = (getLong("allTimeAudioWords")   ?: 0L).toInt(),
    )
}
