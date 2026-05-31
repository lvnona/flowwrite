package ca.u11.flowwrite.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Weekly free-plan limits. Lives at Firestore [config/limits] and is edited
 * at runtime by the admin panel — never hardcoded in the app. The defaults
 * here are used ONLY as a fallback if the snapshot hasn't been read yet (or
 * the doc doesn't exist on a fresh install).
 */
data class FreeLimits(
    val generations: Int = 50,
    val audioWords:  Int = 2500,
)

/**
 * Live listener for [config/limits]. Auth-aware: attaches only after Firebase
 * Auth confirms a signed-in user (matches [ApiKeyRepository]'s pattern, so we
 * never get permission-denied on cold-start races).
 *
 * Server-side enforcement remains authoritative; the values here drive the UI
 * (usage bars, "approaching limit" messaging) and the optional client-side
 * pre-call cap.
 */
class LimitsRepository {

    private val db   = Firebase.firestore
    private val auth = Firebase.auth

    private val _limits = MutableStateFlow(FreeLimits())
    val limits: StateFlow<FreeLimits> = _limits.asStateFlow()

    private var firestoreReg: ListenerRegistration? = null
    private var authListener: FirebaseAuth.AuthStateListener? = null

    fun startListening() {
        if (authListener != null) return
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            if (firebaseAuth.currentUser != null) attachFirestoreListener()
            else detachFirestoreListener()
        }
        authListener = listener
        auth.addAuthStateListener(listener)
    }

    fun stopListening() {
        authListener?.let { auth.removeAuthStateListener(it) }
        authListener = null
        detachFirestoreListener()
    }

    private fun attachFirestoreListener() {
        if (firestoreReg != null) return
        firestoreReg = db.collection("config").document("limits")
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    // Permission still propagating on cold start — let the auth
                    // listener re-attach us on the next state change.
                    detachFirestoreListener()
                    return@addSnapshotListener
                }
                if (snap != null && snap.exists()) {
                    _limits.value = FreeLimits(
                        generations = snap.getLong("freeWeeklyGenerations")?.toInt() ?: 50,
                        audioWords  = snap.getLong("freeWeeklyAudioWords")?.toInt() ?: 2500,
                    )
                }
                // If the doc is missing, keep the defaults set in _limits.
            }
    }

    private fun detachFirestoreListener() {
        firestoreReg?.remove()
        firestoreReg = null
    }
}
