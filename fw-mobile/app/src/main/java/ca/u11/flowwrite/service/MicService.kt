package ca.u11.flowwrite.service

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import ca.u11.flowwrite.BuildConfig
import ca.u11.flowwrite.FlowWriteApp
import ca.u11.flowwrite.R
import ca.u11.flowwrite.data.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Foreground service that records audio and sends it to the FlowWrite server
 * proxy for transcription. The proxy holds the keys, polishes the text,
 * enforces limits, and records usage.
 *
 * Flow per recording session:
 *   1. ACTION_START → start MediaRecorder (MPEG-4/AAC), post foreground notification
 *   2. ACTION_STOP  → stop recorder
 *   3. Upload audio to api-transcribe.php (proxy)
 *   4. Deliver returned text to FwAccessibilityService → clipboard fallback
 *   5. stopSelf()
 */
class MicService : LifecycleService() {

    private val app by lazy { FlowWriteApp.get(this) }

    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var recordingStartedAt = 0L

    private val audioManager by lazy { getSystemService(AudioManager::class.java) }
    private var focusRequest: AudioFocusRequest? = null

    /** Another app took audio focus mid-recording — stop and discard. */
    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
                if (recorder != null) {
                    discardRecording("Recording interrupted by another app — discarded.")
                }
        }
    }

    companion object {
        const val ACTION_START = "ca.u11.flowwrite.MIC_START"
        const val ACTION_STOP  = "ca.u11.flowwrite.MIC_STOP"
        private const val NOTIF_ID = 2

        // Recordings shorter/smaller than this are accidental — not uploaded.
        private const val MIN_DURATION_MS = 500L
        private const val MIN_FILE_BYTES  = 1_024L

        fun startIntent(context: Context) =
            Intent(context, MicService::class.java).apply { action = ACTION_START }

        fun stopIntent(context: Context) =
            Intent(context, MicService::class.java).apply { action = ACTION_STOP }
    }

    // -----------------------------------------------------------------------
    // Service entry point
    // -----------------------------------------------------------------------

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_START -> handleStart()
            ACTION_STOP  -> handleStop()
        }
        return START_NOT_STICKY
    }

    // -----------------------------------------------------------------------
    // Recording
    // -----------------------------------------------------------------------

    private fun handleStart() {
        if (recorder != null) return   // already recording

        // Crash guard: the service can be started (bubble tap, boot restore)
        // without the runtime mic permission. Bail out instead of crashing.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            RecordingBus.emitError("Microphone permission missing — grant it in FlowWrite settings.")
            stopSelf()
            return
        }

        // Audio focus: duck other audio while dictating; without it, don't record.
        if (!requestAudioFocus()) {
            RecordingBus.emitError("Couldn't start recording — another app is using the mic.")
            stopSelf()
            return
        }

        startForegroundCompat(buildNotification(getString(R.string.notif_recording)))

        val file = File(cacheDir, "fw_rec_${System.currentTimeMillis()}.m4a")
            .also { audioFile = it }

        try {
            recorder = SpeechRecorder.create(this, file).apply { start() }
            recordingStartedAt = System.currentTimeMillis()
        } catch (e: Exception) {
            recorder?.runCatching { release() }
            recorder = null
            file.delete()
            audioFile = null
            RecordingBus.setState(RecordingBus.State.IDLE)
            RecordingBus.emitError("Couldn't start microphone: ${e.message}")
            abandonAudioFocus()
            stopSelf()
            return
        }

        RecordingBus.setState(RecordingBus.State.RECORDING)

        // Prefetch the Firebase ID token now, while the user is still talking,
        // so the SDK's cached/refreshed token is ready the instant recording
        // stops — removes a potential network round trip from the critical
        // path between "stop talking" and "text appears."
        lifecycleScope.launch(Dispatchers.IO) {
            runCatching { app.auth.getIdToken(false) }
        }
    }

    private fun handleStop() {
        val tStopTapped = System.currentTimeMillis()
        recorder?.runCatching { stop() }
        recorder?.release()
        recorder = null
        abandonAudioFocus()
        val tRecorderFinalized = System.currentTimeMillis()

        val file = audioFile
        if (file == null || !file.exists()) {
            RecordingBus.setState(RecordingBus.State.IDLE)
            stopSelf()
            return
        }

        // Accidental taps / blips: too short to contain speech — skip upload.
        val durationMs = tStopTapped - recordingStartedAt
        if (durationMs < MIN_DURATION_MS || file.length() < MIN_FILE_BYTES) {
            RecordingBus.emitError("Recording too short — speak for a moment before stopping.")
            cleanup(file)
            return
        }

        getSystemService(android.app.NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(getString(R.string.notif_processing)))

        RecordingBus.setState(RecordingBus.State.PROCESSING)

        lifecycleScope.launch {
            val uid = app.auth.currentUser?.uid
            if (uid == null) {
                RecordingBus.emitError("Not signed in — please reopen FlowWrite.")
                cleanup(file)
                return@launch
            }

            try {
                // Transcription, polish, limit enforcement and usage recording
                // all happen on the proxy. We just upload the audio.
                val result = withContext(Dispatchers.IO) { app.api.transcribe(file) }
                val tTranscribed = System.currentTimeMillis()

                // Deliver the text to the focused field.
                RecordingBus.emitText(result.text)
                withContext(Dispatchers.Main) {
                    val svc = FwAccessibilityService.instance
                    if (svc != null) {
                        svc.insertText(result.text)
                    } else {
                        // Accessibility service not enabled — clipboard fallback
                        val cm = getSystemService(android.content.ClipboardManager::class.java)
                        cm.setPrimaryClip(
                            android.content.ClipData.newPlainText("FlowWrite", result.text)
                        )
                        RecordingBus.emitError("Text copied — enable Accessibility service for auto-insert")
                    }
                }
                val tInserted = System.currentTimeMillis()

                // TEMP diagnostic — remove once the dominant latency source is
                // confirmed. See ApiClient's "transcribe:" log for the network
                // breakdown (token fetch vs. round trip).
                if (BuildConfig.DEBUG) {
                    android.util.Log.i(
                        "FwLatency",
                        "handleStop: recorderFinalizeMs=${tRecorderFinalized - tStopTapped} " +
                            "apiCallMs=${tTranscribed - tRecorderFinalized} " +
                            "insertMs=${tInserted - tTranscribed} " +
                            "totalStopToInsertMs=${tInserted - tStopTapped}",
                    )
                }

            } catch (e: ApiClient.LimitReachedException) {
                RecordingBus.emitError(
                    "Word limit reached — upgrade at flowwrite.u11.ca (resets Monday)."
                )
            } catch (e: ApiClient.ApiException) {
                RecordingBus.emitError(e.message ?: "Transcription error")
            } catch (e: Exception) {
                RecordingBus.emitError("Transcription failed: ${e.message}")
            } finally {
                cleanup(file)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    /** Stops and deletes an in-progress recording (e.g. lost audio focus). */
    private fun discardRecording(message: String) {
        recorder?.runCatching { stop() }
        recorder?.release()
        recorder = null
        audioFile?.delete()
        audioFile = null
        abandonAudioFocus()
        RecordingBus.setState(RecordingBus.State.IDLE)
        RecordingBus.emitError(message)
        stopSelf()
    }

    private fun requestAudioFocus(): Boolean {
        val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setOnAudioFocusChangeListener(focusChangeListener)
            .build()
        focusRequest = req
        return audioManager.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonAudioFocus() {
        focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        focusRequest = null
    }

    private fun cleanup(file: File?) {
        file?.delete()
        audioFile = null
        RecordingBus.setState(RecordingBus.State.IDLE)
        stopSelf()
    }

    override fun onDestroy() {
        recorder?.runCatching { stop() }
        recorder?.release()
        recorder = null
        audioFile?.delete()
        abandonAudioFocus()
        super.onDestroy()
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, FlowWriteApp.CHANNEL_MIC)
            .setSmallIcon(R.drawable.ic_mic)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .build()

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }
}
