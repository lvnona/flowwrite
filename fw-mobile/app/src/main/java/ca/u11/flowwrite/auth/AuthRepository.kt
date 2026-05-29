package ca.u11.flowwrite.auth

import androidx.activity.ComponentActivity
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await
import ca.u11.flowwrite.R

/**
 * Handles Google Sign-In via Credential Manager and Firebase Authentication.
 *
 * Sign-in strategy (two-step):
 *  1. Try GetGoogleIdOption — shows a fast bottom-sheet if a Google account
 *     is already on the device (ideal for returning users).
 *  2. Fall back to GetSignInWithGoogleOption — shows a full Google sign-in
 *     web flow when no account exists yet (new device, emulator, first run).
 *
 * API keys are NEVER stored here or in the app — they live server-side only.
 */
class AuthRepository(private val appContext: android.content.Context) {

    private val auth: FirebaseAuth = FirebaseAuth.getInstance()

    val currentUser: FirebaseUser?
        get() = auth.currentUser

    /**
     * Launches Google Sign-In and signs the result into Firebase.
     * Must be called from a coroutine with an [activity] in the foreground.
     */
    suspend fun signInWithGoogle(activity: ComponentActivity): Result<FirebaseUser> = runCatching {
        val webClientId = activity.getString(R.string.default_web_client_id)
        val credentialManager = CredentialManager.create(activity)

        // -- Step 1: fast bottom-sheet (works when a Google account is on-device) --
        val idToken = runCatching {
            val option = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(webClientId)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build()
            val result = credentialManager.getCredential(activity, request)
            GoogleIdTokenCredential.createFrom(result.credential.data).idToken
        }.getOrElse { firstError ->
            // -- Step 2: full web sign-in flow (no account on device / emulator) --
            runCatching {
                val option = GetSignInWithGoogleOption.Builder(webClientId).build()
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()
                val result = credentialManager.getCredential(activity, request)
                GoogleIdTokenCredential.createFrom(result.credential.data).idToken
            }.getOrElse { secondError ->
                // Both paths failed — surface the more useful error
                throw secondError
            }
        }

        val firebaseCred = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(firebaseCred).await().user
            ?: error("Firebase sign-in returned null user")
    }

    /**
     * Returns a short-lived Firebase ID token for the current user, or null if
     * not signed in. Sent as a Bearer token to the PHP proxy.
     */
    suspend fun getIdToken(forceRefresh: Boolean = false): String? =
        auth.currentUser?.getIdToken(forceRefresh)?.await()?.token

    fun signOut() = auth.signOut()
}
