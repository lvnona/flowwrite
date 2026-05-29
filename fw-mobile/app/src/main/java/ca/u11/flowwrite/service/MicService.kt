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
 * Foreground service that records audio and transcribes it directly via
 * OpenAI Whisper — no PHP proxy involved.
 *
 * Flow per recording session:
 *   1. ACTION_START → start MediaRecorder (MPEG-4/AAC), post foreground notification
 *   2. ACTION_STOP  → stop recorder, check weekly audio-word quota
 *   3. POST audio to Whisper → gpt-4o-mini polish pass (same as Electron)
 *   4. Increment audioWordsWeekly / allTimeAudioWords in Firestore directly
 *   5. Deliver text to FwAccessibilityService → clipboard fallback
 *   6. stopSelf()
 */
class MicService : LifecycleService() {

    private val app by lazy { FlowWriteApp.get(this) }

    private var recorder: MediaRecorder? = null
    private var audioFile: File? = null

    companion object {
        const val ACTION_START = "ca.u11.flowwrite.MIC_START"
        const val ACTION_STOP  = "ca.u11.flowwrite.MIC_STOP"
        private const val NOTIF_ID = 2

        /** Free-tier weekly audio-word cap — mirrors Electron's FREE_LIMITS */
        private const val FREE_AUDIO_WORDS = 2500

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

        recorder = createRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(128_000)
            setAudioSamplingRate(44_100)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }

        RecordingBus.setState(RecordingBus.State.RECORDING)
    }

    private fun handleStop() {
        recorder?.runCatching { stop() }
        recorder?.release()
        recorder = null

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
                // ── Quota check ──────────────────────────────────────────────
                val profile = withContext(Dispatchers.IO) { app.profileRepo.getProfile(uid) }
                val isFree  = profile?.plan != "pro"
                if (isFree && (profile?.audioWordsThisWeek ?: 0) >= FREE_AUDIO_WORDS) {
                    RecordingBus.emitError(
                        "Weekly audio limit reached ($FREE_AUDIO_WORDS words/week). Upgrade to Pro."
                    )
                    cleanup(file)
                    return@launch
                }

                // ── Transcribe (Whisper → polish) ────────────────────────────
                val result = withContext(Dispatchers.IO) { app.api.transcribe(file) }

                // ── Increment usage in Firestore ─────────────────────────────
                withContext(Dispatchers.IO) {
                    app.profileRepo.incrementAudioWords(uid, result.words)
                }

                RecordingBus.emitText(result.text)

                // ── Insert text ──────────────────────────────────────────────
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

            } catch (e: ApiClient.LimitExceededException) {
                RecordingBus.emitError(e.message ?: "Limit reached")
            } catch (e: ApiClient.ApiException) {
                RecordingBus.emitError(e.message ?: "API error")
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

    @Suppress("DEPRECATION")
    private fun createRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this)
        else MediaRecorder()

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
