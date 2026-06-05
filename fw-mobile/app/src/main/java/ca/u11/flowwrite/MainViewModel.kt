package ca.u11.flowwrite

import android.app.Application
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ca.u11.flowwrite.data.FreeLimits
import ca.u11.flowwrite.data.Template
import ca.u11.flowwrite.data.UserProfile
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Navigation destination enum
// ---------------------------------------------------------------------------

sealed class AppScreen {
    /** Splash while resolving auth + prefs. */
    object Loading : AppScreen()
    /** Google sign-in. */
    object SignIn : AppScreen()
    /** Three-page onboarding (shown once). */
    object Onboarding : AppScreen()
    /** Permission checklist (overlay, accessibility, mic, notifications). */
    object Permissions : AppScreen()
    /** Main app — tabs: Dashboard / Templates / Settings. */
    object Home : AppScreen()
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val fwApp = app as FlowWriteApp
    val auth         get() = fwApp.auth
    val profileRepo  get() = fwApp.profileRepo
    val api          get() = fwApp.api

    private val prefs = app.getSharedPreferences("fw_prefs", Context.MODE_PRIVATE)

    // Live Firestore listeners are per-user.  We track them so sign-out (and
    // re-subscribing for a different user) tears the previous ones down
    // cleanly — otherwise the old listener keeps firing and can briefly
    // overwrite the new user's data after a Google account switch.
    private var profileJob: Job? = null
    private var templateJob: Job? = null

    // -----------------------------------------------------------------------
    // Exposed state — auth / navigation
    // -----------------------------------------------------------------------

    private val _screen = MutableStateFlow<AppScreen>(AppScreen.Loading)
    val screen: StateFlow<AppScreen> = _screen.asStateFlow()

    private val _profile = MutableStateFlow<UserProfile?>(null)
    val profile: StateFlow<UserProfile?> = _profile.asStateFlow()

    private val _isSigningIn = MutableStateFlow(false)
    val isSigningIn: StateFlow<Boolean> = _isSigningIn.asStateFlow()

    private val _signInError = MutableStateFlow<String?>(null)
    val signInError: StateFlow<String?> = _signInError.asStateFlow()

    // -----------------------------------------------------------------------
    // Live free-plan limits (admin-managed at config/limits) — DISPLAY only.
    // The server enforces; we just show the "X / N used" denominator.
    // -----------------------------------------------------------------------

    val limits: StateFlow<FreeLimits> = fwApp.limitsRepo.limits

    // -----------------------------------------------------------------------
    // Exposed state — templates
    // -----------------------------------------------------------------------

    private val _templates = MutableStateFlow<List<Template>>(emptyList())
    val templates: StateFlow<List<Template>> = _templates.asStateFlow()

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------

    init {
        val user = auth.currentUser
        if (user == null) {
            _screen.value = AppScreen.SignIn
        } else {
            // Make sure the users/{uid} doc exists (covers users whose previous
            // sign-in didn't create it — otherwise the listener would never emit
            // and the Dashboard would spin forever).
            viewModelScope.launch { profileRepo.ensureUserDoc(user) }
            startProfileListener(user.uid)
            startTemplateListener(user.uid)
            navigateAfterAuth()
        }
    }

    // -----------------------------------------------------------------------
    // Auth actions
    // -----------------------------------------------------------------------

    fun signIn(activity: ComponentActivity) {
        viewModelScope.launch {
            _isSigningIn.value = true
            _signInError.value = null

            auth.signInWithGoogle(activity)
                .onSuccess { user ->
                    // CREATE users/{uid} on first sign-in (rule requires
                    // plan='free' + status='active'). Awaited so the listener
                    // emits on its first read.
                    profileRepo.ensureUserDoc(user)
                    startProfileListener(user.uid)
                    startTemplateListener(user.uid)
                    navigateAfterAuth()
                }
                .onFailure { e ->
                    _signInError.value = e.message ?: "Sign-in failed. Please try again."
                }

            _isSigningIn.value = false
        }
    }

    fun signOut() {
        // Tear down per-user Firestore listeners — otherwise they keep firing
        // on the previous user's docs and can briefly overwrite a new
        // sign-in's data.
        profileJob?.cancel();  profileJob = null
        templateJob?.cancel(); templateJob = null

        auth.signOut()

        // Clear all per-user in-memory state so the next sign-in starts clean
        // (no stale templates flashing through).
        _profile.value   = null
        _templates.value = emptyList()

        _screen.value = AppScreen.SignIn
    }

    fun clearSignInError() { _signInError.value = null }

    // -----------------------------------------------------------------------
    // Navigation callbacks
    // -----------------------------------------------------------------------

    fun onboardingComplete() {
        prefs.edit().putBoolean("onboarding_done", true).apply()
        navigateAfterAuth()
    }

    fun permissionsComplete() {
        prefs.edit().putBoolean("permissions_seen", true).apply()
        _screen.value = AppScreen.Home
    }

    // -----------------------------------------------------------------------
    // Template create / edit / delete
    // -----------------------------------------------------------------------

    fun saveTemplate(template: ca.u11.flowwrite.data.Template) {
        val uid = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            runCatching { fwApp.templateRepo.saveTemplate(uid, template) }
            // List refreshes automatically via the Firestore listener.
        }
    }

    fun deleteTemplate(id: String) {
        val uid = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            runCatching { fwApp.templateRepo.deleteTemplate(uid, id) }
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private fun navigateAfterAuth() {
        _screen.value = when {
            !prefs.getBoolean("onboarding_done", false)   -> AppScreen.Onboarding
            !prefs.getBoolean("permissions_seen", false)  -> AppScreen.Permissions
            else                                           -> AppScreen.Home
        }
    }

    private fun startProfileListener(uid: String) {
        profileJob?.cancel()   // tear down any previous user's listener first
        profileJob = viewModelScope.launch {
            profileRepo.userProfileFlow(uid)
                .catch { e ->
                    // Surface to logcat so a Dashboard stuck on null is debuggable.
                    // Common causes: PERMISSION_DENIED or users/{uid} not yet created.
                    android.util.Log.e("FwProfile", "userProfileFlow error: ${e.message}", e)
                }
                .collectLatest { profile -> _profile.value = profile }
        }
    }

    private fun startTemplateListener(uid: String) {
        templateJob?.cancel()
        templateJob = viewModelScope.launch {
            fwApp.templateRepo.templatesFlow(uid)
                .catch { /* ignore errors — show empty list */ }
                .collectLatest { list -> _templates.value = list }
        }
    }
}
