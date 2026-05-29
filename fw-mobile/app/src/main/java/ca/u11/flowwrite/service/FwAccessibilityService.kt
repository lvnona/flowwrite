package ca.u11.flowwrite.service

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * Tracks the currently-focused editable field and inserts transcribed text
 * into it after a dictation finishes.
 *
 * Text insertion strategy (in order of preference):
 *  1. ACTION_SET_TEXT   — replaces the full field content.  Works in most
 *                         standard EditText / TextField widgets.
 *  2. Clipboard paste   — fallback for fields that block ACTION_SET_TEXT
 *                         (web views, custom editors).  We copy the text to
 *                         the clipboard and fire ACTION_PASTE.
 *
 * This service does NOT read, store, or transmit any screen content.  It only
 * writes to the focused field when explicitly triggered by a completed
 * transcription.
 *
 * Registration: AndroidManifest.xml + res/xml/accessibility_service_config.xml
 */
class FwAccessibilityService : AccessibilityService() {

    /** Cached reference to the most recent focused editable node. */
    private var focusedNode: AccessibilityNodeInfo? = null

    /** Debounces the hide signal so switching between fields doesn't flicker. */
    private val handler = Handler(Looper.getMainLooper())

    /** Throttle for the noisy TYPE_WINDOW_CONTENT_CHANGED stream. */
    private var lastContentEval = 0L

    /**
     * Re-checks (after a debounce) whether an editable field still holds input
     * focus.  Querying [rootInActiveWindow] is reliable from an accessibility
     * service — unlike InputMethodManager.isAcceptingText(), which reflects only
     * our own process and always returns false here.
     */
    private val hideRunnable = Runnable {
        val focused = findEditableFocus()
        // Hide only if there's no editable field AND the keyboard is gone.
        // The keyboard being open means the user is still typing somewhere
        // (covers WebView / custom editors we can't pin a node for).
        if (focused == null && !isImeVisible()) {
            RecordingBus.setInputFocused(false)
        }
        focused?.recycle()
    }

    // -----------------------------------------------------------------------
    // Public API called by MicService / GenerateActivity
    // -----------------------------------------------------------------------

    /**
     * Inserts [text] after a short delay — used after the generate panel is
     * dismissed, giving the ORIGINAL app's field time to regain focus first.
     * Mirrors the desktop behaviour: panel closes, text lands in the field.
     */
    fun insertTextDeferred(text: String, delayMs: Long = 450L) {
        handler.postDelayed({ insertText(text) }, delayMs)
    }

    /**
     * Returns the current text in the focused editable field (the user's draft),
     * or "" if none.  Used to feed the user's input into template generation.
     */
    fun readFocusedText(): String {
        val node = focusedNode?.refresh()?.let { focusedNode }
            ?: rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        return node?.text?.toString().orEmpty()
    }

    /**
     * Insert [text] into the last-known focused editable field.
     *
     * Must be called on the main thread (the service callback thread).
     */
    fun insertText(text: String) {
        val node = focusedNode?.refresh()?.let { focusedNode }
            ?: rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

        if (node == null || !node.isEditable) {
            // Last resort — put it on the clipboard so the user can paste
            copyToClipboard(text)
            return
        }

        // Attempt ACTION_SET_TEXT first
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text,
            )
        }
        val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)

        if (!ok) {
            // Fallback: clipboard + paste
            copyToClipboard(text)
            node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        }
    }

    // -----------------------------------------------------------------------
    // AccessibilityService callbacks
    // -----------------------------------------------------------------------

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        // While the generate panel is open the bubble is suppressed — ignore
        // everything so we don't fight its visibility or retarget the field.
        if (RecordingBus.panelOpen.value) return

        val pkg = event.packageName?.toString().orEmpty()

        when (event.eventType) {

            // Fast path: the event's own source is editable (standard fields).
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                if (pkg in NOISY_PACKAGES) return
                val src = event.source
                if (src != null && src.isEditable) {
                    showForNode(src)
                } else {
                    evaluateActiveFocus()
                }
            }

            // App switch / home / dialog / keyboard open-close — ALWAYS evaluate
            // (even from launcher/systemui) so leaving a field hides the bubble.
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                evaluateActiveFocus()
            }

            // Content changes in WebView-based editors (Gmail). Very frequent and
            // noisy from system UI, so skip those packages + throttle. Show-only.
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                if (pkg in NOISY_PACKAGES) return
                val now = android.os.SystemClock.uptimeMillis()
                if (now - lastContentEval >= CONTENT_THROTTLE_MS) {
                    lastContentEval = now
                    val focused = findEditableFocus()
                    if (focused != null) {
                        showForNode(focused)
                        focused.recycle()
                    }
                    // Note: do NOT hide on content-changed — too noisy.
                }
            }
        }
    }

    /**
     * Queries for the real focused input.  Reliable across standard fields AND
     * WebView / custom editors (Gmail, browsers) where the triggering event's
     * source is a non-editable container.  Scans every window, because some
     * email apps host the compose field in a separate (non-active) window.
     */
    private fun evaluateActiveFocus() {
        val focused = findEditableFocus()
        val ime = isImeVisible()
        if (focused != null) {
            // Best case — we have the exact editable node (for text insertion)
            showForNode(focused)
            focused.recycle()
        } else if (ime) {
            // Keyboard is up but the field is a WebView / custom editor we can't
            // pin a node for. Show anyway — the user is clearly in an input.
            handler.removeCallbacks(hideRunnable)
            RecordingBus.setInputFocused(true)
        } else {
            scheduleHideRecheck()
        }
    }

    /**
     * Public re-evaluation hook — BubbleService calls this when it (re)starts so
     * the bubble appears even if no fresh focus event arrives (e.g. after the
     * process was restarted while a field was already focused).
     */
    fun requestFocusReevaluation() {
        if (RecordingBus.panelOpen.value) return
        handler.post { evaluateActiveFocus() }
    }

    /** True when the soft keyboard (IME) window is currently on screen. */
    private fun isImeVisible(): Boolean =
        windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }

    /**
     * Returns the focused editable node from the active window, or — if none —
     * by scanning all windows.  Caller owns the returned node (must recycle).
     */
    private fun findEditableFocus(): AccessibilityNodeInfo? {
        rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { f ->
            if (f.isEditable) return f
            f.recycle()
        }
        // Some apps (Gmail compose, multi-window) host the field elsewhere
        for (w in windows) {
            val root = w.root ?: continue
            val f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (f != null && f.isEditable) return f
            f?.recycle()
        }
        return null
    }

    private fun showForNode(node: AccessibilityNodeInfo) {
        handler.removeCallbacks(hideRunnable)
        focusedNode?.recycle()
        focusedNode = AccessibilityNodeInfo.obtain(node)
        RecordingBus.setInputFocused(true)
    }

    override fun onInterrupt() {
        // Required override — nothing to interrupt
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        // If the bubble is already running, re-sync visibility to current focus.
        if (BubbleService.isRunning) {
            handler.postDelayed({ requestFocusReevaluation() }, 300)
        }
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        handler.removeCallbacks(hideRunnable)
        RecordingBus.setInputFocused(false)
        focusedNode?.recycle()
        focusedNode = null
        return super.onUnbind(intent)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Schedules the debounced focus re-check.  The actual decision to hide is
     * made inside [hideRunnable], which queries the active window — so transient
     * events (keyboard opening, brief focus blips) don't cause a flicker.
     */
    private fun scheduleHideRecheck() {
        handler.removeCallbacks(hideRunnable)
        handler.postDelayed(hideRunnable, HIDE_DELAY_MS)
    }

    private fun copyToClipboard(text: String) {
        val cm = getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("FlowWrite", text))
    }

    // -----------------------------------------------------------------------
    // Static accessor for MicService
    // -----------------------------------------------------------------------

    companion object {
        private const val HIDE_DELAY_MS       = 600L  // debounce before re-checking focus
        private const val CONTENT_THROTTLE_MS = 350L  // min gap between content-change evals

        /**
         * Packages whose noisy content/focus events we skip (but their
         * window-STATE changes are still processed, so going home still hides
         * the bubble).  Our own package is included so the panel never becomes
         * the insertion target.
         */
        private val NOISY_PACKAGES = setOf(
            "com.android.systemui",
            "com.sec.android.app.launcher",
            "com.samsung.android.spay",
            "com.sec.android.daemonapp",
            "ca.u11.flowwrite",
        )
        /**
         * Non-null while the service is connected.  MicService calls
         * [insertText] through this reference after a successful transcription.
         * Accessed only on the main thread.
         */
        @Volatile
        var instance: FwAccessibilityService? = null
            private set
    }
}
