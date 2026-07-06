package ca.u11.flowwrite.service

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
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

    companion object {
        const val ACTION_START = "ca.u11.flowwrite.MIC_START"
        const val ACTION_STOP  = "ca.u11.flowwrite.MIC_STOP"
        private const val NOTIF_ID = 2

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

        startForegroundCompat(buildNotification(getString(R.string.notif_recording)))

        val file = File(cacheDir, "fw_rec_${System.currentTimeMillis()}.m4a")
            .also { audioFile = it }

        recorder = SpeechRecorder.create(this, file).apply { start() }

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
        val tRecorderFinalized = System.currentTimeMillis()

        val file = audioFile
        if (file == null || !file.exists()) {
            RecordingBus.setState(RecordingBus.State.IDLE)
            stopSelf()
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
                android.util.Log.i(
                    "FwLatency",
                    "handleStop: recorderFinalizeMs=${tRecorderFinalized - tStopTapped} " +
                        "apiCallMs=${tTranscribed - tRecorderFinalized} " +
                        "insertMs=${tInserted - tTranscribed} " +
                        "totalStopToInsertMs=${tInserted - tStopTapped}",
                )

            } catch (e: ApiClient.LimitReachedException) {
                RecordingBus.emitError(
                    "Weekly dictation limit reached. Resets Monday — " +
                        "open FlowWrite to upgrade to Pro for unlimited."
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
