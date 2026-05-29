package ca.u11.flowwrite.service

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Toast
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import ca.u11.flowwrite.FlowWriteApp
import ca.u11.flowwrite.GenerateActivity
import ca.u11.flowwrite.R
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Foreground service that draws a draggable circular floating bubble over all
 * other apps, anchored at the right edge (Whispr-style).
 *
 * Visibility: controlled by [FwAccessibilityService] via [RecordingBus.inputFocused].
 *   - Appears when the user taps any editable field
 *   - Hides when no editable field is focused (and not recording)
 *
 * States (driven by [RecordingBus.state]):
 *   IDLE       — purple circle, FlowWrite glyph, ready to record
 *   RECORDING  — red circle, pulsing
 *   PROCESSING — orange circle, dimmed glyph, slow pulse
 *
 * Touch:
 *   Tap        — toggle recording (dictation)
 *   Drag       — reposition the bubble
 *   Long-press — open the generate / templates panel (GenerateActivity)
 */
class BubbleService : LifecycleService() {

    private lateinit var windowManager: WindowManager
    private lateinit var bubbleRoot: FrameLayout
    private lateinit var iconView: ImageView
    private lateinit var params: WindowManager.LayoutParams

    // Drag state
    private var startX      = 0
    private var startY      = 0
    private var startTouchX = 0f
    private var startTouchY = 0f
    private var isDragging  = false

    // Long-press
    private val longPressHandler  = Handler(Looper.getMainLooper())
    private var longPressRunnable: Runnable? = null

    private var pulseAnim: ObjectAnimator? = null

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        startForegroundCompat(buildNotification())
        windowManager = getSystemService(WindowManager::class.java)

        // Clear any stuck "panel open" suppression (e.g. if GenerateActivity was
        // killed without onDestroy) so the bubble isn't permanently hidden.
        RecordingBus.setPanelOpen(false)

        createBubble()
        observeState()
        observeInputFocus()
        observePanel()
        observeErrors()

        // Remember that the user wants the bubble — used to restore it on reboot.
        BubblePrefs.setEnabled(this, true)

        // If a text field is already focused right now, show immediately
        // (covers process restart where no fresh focus event arrives).
        longPressHandler.postDelayed(
            { FwAccessibilityService.instance?.requestFocusReevaluation() },
            400,
        )

        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (intent?.action == ACTION_STOP) {
            BubblePrefs.setEnabled(this, false)   // user explicitly stopped it
            stopSelf()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        pulseAnim?.cancel()
        longPressHandler.removeCallbacksAndMessages(null)
        if (::bubbleRoot.isInitialized) runCatching { windowManager.removeView(bubbleRoot) }
        runCatching { stopService(Intent(this, MicService::class.java)) }
        RecordingBus.setState(RecordingBus.State.IDLE)
        super.onDestroy()
    }

    // -----------------------------------------------------------------------
    // Build the circular bubble
    // -----------------------------------------------------------------------

    private fun createBubble() {
        val density  = resources.displayMetrics.density
        val size     = (BUBBLE_DP * density).toInt()
        val iconSize = (ICON_DP * density).toInt()
        val margin   = (MARGIN_DP * density).toInt()

        bubbleRoot = FrameLayout(this)
        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(COLOR_IDLE)
        }
        bubbleRoot.background = bg
        bubbleRoot.elevation  = 8f * density

        iconView = ImageView(this).apply {
            setImageDrawable(AppCompatResources.getDrawable(this@BubbleService, R.drawable.ic_bubble_fw))
        }
        bubbleRoot.addView(
            iconView,
            FrameLayout.LayoutParams(iconSize, iconSize).apply { gravity = Gravity.CENTER },
        )

        // Right edge, vertically centered
        val display = displaySize()
        params = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = display.widthPixels - size - margin
            y = (display.heightPixels * 0.6f).toInt()
        }

        bubbleRoot.setOnTouchListener { v, event -> handleTouch(v as FrameLayout, event) }

        // Start hidden — revealed when an editable field gains focus
        bubbleRoot.visibility = View.INVISIBLE
        windowManager.addView(bubbleRoot, params)
    }

    // -----------------------------------------------------------------------
    // Touch handling
    // -----------------------------------------------------------------------

    private fun handleTouch(view: FrameLayout, event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                startX      = params.x
                startY      = params.y
                startTouchX = event.rawX
                startTouchY = event.rawY
                isDragging  = false
                longPressRunnable = Runnable { onLongPress(view) }.also {
                    longPressHandler.postDelayed(it, LONG_PRESS_MS)
                }
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = (event.rawX - startTouchX).toInt()
                val dy = (event.rawY - startTouchY).toInt()
                if (!isDragging && (abs(dx) > DRAG_THRESHOLD || abs(dy) > DRAG_THRESHOLD)) {
                    isDragging = true
                    longPressRunnable?.let { longPressHandler.removeCallbacks(it) }
                }
                if (isDragging) {
                    params.x = startX + dx
                    params.y = startY + dy
                    windowManager.updateViewLayout(view, params)
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                longPressRunnable?.let { longPressHandler.removeCallbacks(it) }
                longPressRunnable = null
                if (!isDragging && event.action == MotionEvent.ACTION_UP) onTap()
            }
        }
        return true
    }

    private fun onTap() {
        when (RecordingBus.state.value) {
            RecordingBus.State.IDLE       -> startForegroundService(MicService.startIntent(this))
            RecordingBus.State.RECORDING  -> startService(MicService.stopIntent(this))
            RecordingBus.State.PROCESSING -> { /* wait */ }
        }
    }

    private fun onLongPress(view: FrameLayout) {
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        // Hide the bubble immediately — the panel has its own mic
        bubbleRoot.visibility = View.INVISIBLE
        startActivity(
            Intent(this, GenerateActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        )
    }

    // -----------------------------------------------------------------------
    // Observers
    // -----------------------------------------------------------------------

    private fun observeState() {
        lifecycleScope.launch {
            RecordingBus.state.collectLatest { state ->
                if (state != RecordingBus.State.IDLE) bubbleRoot.visibility = View.VISIBLE
                updateBubble(state)
            }
        }
    }

    private fun observeInputFocus() {
        lifecycleScope.launch {
            RecordingBus.inputFocused.collectLatest { focused ->
                if (RecordingBus.panelOpen.value) return@collectLatest
                if (RecordingBus.state.value != RecordingBus.State.IDLE) return@collectLatest
                bubbleRoot.visibility = if (focused) View.VISIBLE else View.INVISIBLE
            }
        }
    }

    private fun observePanel() {
        lifecycleScope.launch {
            RecordingBus.panelOpen.collectLatest { open ->
                if (open) bubbleRoot.visibility = View.INVISIBLE
                // When the panel closes, the next focus event re-shows the bubble.
            }
        }
    }

    private fun observeErrors() {
        lifecycleScope.launch {
            RecordingBus.error.collect { msg ->
                Toast.makeText(this@BubbleService, msg, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun updateBubble(state: RecordingBus.State) {
        pulseAnim?.cancel()
        bubbleRoot.scaleX = 1f
        bubbleRoot.scaleY = 1f
        iconView.alpha = 1f

        val bgColor = when (state) {
            RecordingBus.State.IDLE       -> COLOR_IDLE
            RecordingBus.State.RECORDING  -> COLOR_RECORDING
            RecordingBus.State.PROCESSING -> COLOR_PROCESSING
        }
        (bubbleRoot.background as? GradientDrawable)?.setColor(bgColor)

        // 50% transparent at idle; more opaque while active so it's clearly visible
        bubbleRoot.alpha = when (state) {
            RecordingBus.State.IDLE       -> IDLE_ALPHA
            RecordingBus.State.RECORDING  -> 0.95f
            RecordingBus.State.PROCESSING -> 0.85f
        }

        when (state) {
            RecordingBus.State.RECORDING  -> startPulse(0.88f, 1.08f)
            RecordingBus.State.PROCESSING -> { iconView.alpha = 0.6f; startPulse(0.9f, 1.0f) }
            RecordingBus.State.IDLE       -> {}
        }
    }

    private fun startPulse(minScale: Float, maxScale: Float) {
        pulseAnim = ObjectAnimator.ofFloat(bubbleRoot, "scaleX", minScale, maxScale).apply {
            duration    = 700
            repeatCount = ValueAnimator.INFINITE
            repeatMode  = ValueAnimator.REVERSE
            addUpdateListener { bubbleRoot.scaleY = it.animatedValue as Float }
            start()
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, FlowWriteApp.CHANNEL_BUBBLE)
            .setSmallIcon(R.drawable.ic_mic)
            .setContentTitle(getString(R.string.notif_bubble_running))
            .setContentText(getString(R.string.app_name))
            .setOngoing(true)
            .setSilent(true)
            .build()

    @Suppress("DEPRECATION")
    private fun displaySize(): DisplayMetrics {
        val dm = DisplayMetrics()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = windowManager.currentWindowMetrics.bounds
            dm.widthPixels  = bounds.width()
            dm.heightPixels = bounds.height()
        } else {
            windowManager.defaultDisplay.getMetrics(dm)
        }
        return dm
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    // -----------------------------------------------------------------------
    // Companion
    // -----------------------------------------------------------------------

    companion object {
        const val ACTION_STOP = "ca.u11.flowwrite.BUBBLE_STOP"
        private const val NOTIF_ID = 1

        private const val BUBBLE_DP      = 60f
        private const val ICON_DP        = 30f
        private const val MARGIN_DP      = 12f
        private const val DRAG_THRESHOLD = 12
        private const val LONG_PRESS_MS  = 550L
        private const val IDLE_ALPHA     = 0.5f   // 50% transparent when idle

        private const val COLOR_IDLE       = 0xFF7C6CFF.toInt()
        private const val COLOR_RECORDING  = 0xFFE53935.toInt()
        private const val COLOR_PROCESSING = 0xFFFB8C00.toInt()

        @Volatile
        var isRunning: Boolean = false
            private set

        fun startIntent(context: Context) = Intent(context, BubbleService::class.java)
        fun stopIntent(context: Context)  = Intent(context, BubbleService::class.java).apply { action = ACTION_STOP }
    }
}
