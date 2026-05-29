package ca.u11.flowwrite.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Listens to Firestore config/apiKeys in real-time — the same document the
 * Electron desktop app watches in App.jsx via onSnapshot.
 *
 * The admin sets keys once in the Admin panel → every device picks them up
 * automatically without a restart.  Keys are NEVER shipped in the APK.
 *
 * Auth-aware: we attach the Firestore listener only after Firebase Auth confirms
 * a signed-in user.  This avoids permission-denied errors on cold start (before
 * Auth restores its cached token) that would otherwise leave keys empty.
 */
class ApiKeyRepository {

    private val db   = Firebase.firestore
    private val auth = Firebase.auth

    private val _keys = MutableStateFlow(ApiKeys())
    val keys: StateFlow<ApiKeys> = _keys.asStateFlow()

    private var firestoreReg: ListenerRegistration? = null
    private var authListener: FirebaseAuth.AuthStateListener? = null

    /**
     * Start the auth-aware listener.
     * Called once from FlowWriteApp.onCreate — process-scoped.
     */
    fun startListening() {
        if (authListener != null) return

        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            if (firebaseAuth.currentUser != null) {
                attachFirestoreListener()
            } else {
                detachFirestoreListener()
                _keys.value = ApiKeys()
            }
        }
        authListener = listener
        auth.addAuthStateListener(listener)
    }

    fun stopListening() {
        authListener?.let { auth.removeAuthStateListener(it) }
        authListener = null
        detachFirestoreListener()
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    private fun attachFirestoreListener() {
        if (firestoreReg != null) return   // already attached

        firestoreReg = db.collection("config").document("apiKeys")
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    // Permission denied on the first tick (auth token still
                    // propagating) — detach so the auth listener can retry.
                    detachFirestoreListener()
                    return@addSnapshotListener
                }
                if (snap?.exists() == true) {
                    _keys.value = snap.toApiKeys()
                }
            }
    }

    private fun detachFirestoreListener() {
        firestoreReg?.remove()
        firestoreReg = null
    }

    /**
     * Cold [Flow] variant for tests or one-shot reads.
     */
    fun keysFlow(): Flow<ApiKeys> = callbackFlow {
        val reg = db.collection("config").document("apiKeys")
            .addSnapshotListener { snap, _ ->
                trySend(snap?.toApiKeys() ?: ApiKeys())
            }
        awaitClose { reg.remove() }
    }
}

// ---------------------------------------------------------------------------
// Helper — access individual fields directly so we avoid Map<String, Any?>
// type ambiguity in the Firebase Kotlin SDK.
// ---------------------------------------------------------------------------

private fun DocumentSnapshot.toApiKeys() = ApiKeys(
    popupProvider    = getString("popupProvider")    ?: "claude",
    anthropic        = getString("anthropic")        ?: "",
    openaiPopup      = getString("openaiPopup")      ?: "",
    openaiPopupModel = getString("openaiPopupModel") ?: "gpt-4o",
    deepseek         = getString("deepseek")         ?: "",
    deepseekModel    = getString("deepseekModel")    ?: "deepseek-v4-flash",
    openai           = getString("openai")           ?: "",
)
