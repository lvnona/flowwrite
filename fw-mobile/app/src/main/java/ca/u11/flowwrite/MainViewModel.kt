package ca.u11.flowwrite

import android.app.Application
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ca.u11.flowwrite.data.ApiKeys
import ca.u11.flowwrite.data.FreeLimits
import ca.u11.flowwrite.data.Template
import ca.u11.flowwrite.data.UserProfile
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
    // Exposed state — API keys (provider info for Settings tab)
    // -----------------------------------------------------------------------

    val apiKeys: StateFlow<ApiKeys> = fwApp.apiKeyRepo.keys

    // -----------------------------------------------------------------------
    // Live free-plan limits (admin-managed at config/limits)
    // -----------------------------------------------------------------------

    val limits: StateFlow<FreeLimits> = fwApp.limitsRepo.limits

    // -----------------------------------------------------------------------
    // Exposed state — templates
    // -----------------------------------------------------------------------

    private val _templates = MutableStateFlow<List<Template>>(emptyList())
    val templates: StateFlow<List<Template>> = _templates.asStateFlow()

    // -----------------------------------------------------------------------
    // Exposed state — text generation (Templates tab)
    // -----------------------------------------------------------------------

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    /** Non-null when a generation result is ready to display. */
    private val _generateResult = MutableStateFlow<String?>(null)
    val generateResult: StateFlow<String?> = _generateResult.asStateFlow()

    private val _generateError = MutableStateFlow<String?>(null)
    val generateError: StateFlow<String?> = _generateError.asStateFlow()

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------

    init {
        val user = auth.currentUser
        if (user == null) {
            _screen.value = AppScreen.SignIn
        } else {
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
        auth.signOut()
        _profile.value = null
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
    // Text generation
    // -----------------------------------------------------------------------

    fun generateText(prompt: String) {
        if (_isGenerating.value) return
        viewModelScope.launch {
            _isGenerating.value  = true
            _generateError.value = null
            _generateResult.value = null
            try {
                val result = api.generate(prompt)
                _generateResult.value = result.text
                // Increment generation counter in Firestore
                val uid = auth.currentUser?.uid
                if (uid != null) {
                    profileRepo.incrementGeneration(uid)
                }
            } catch (e: Exception) {
                _generateError.value = e.message ?: "Generation failed"
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun clearGenerateResult() {
        _generateResult.value = null
        _generateError.value  = null
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
        viewModelScope.launch {
            profileRepo.userProfileFlow(uid)
                .catch { /* offline / permission error — keep last value */ }
                .collectLatest { profile -> _profile.value = profile }
        }
    }

    private fun startTemplateListener(uid: String) {
        viewModelScope.launch {
            fwApp.templateRepo.templatesFlow(uid)
                .catch { /* ignore errors — show empty list */ }
                .collectLatest { list -> _templates.value = list }
        }
    }
}
