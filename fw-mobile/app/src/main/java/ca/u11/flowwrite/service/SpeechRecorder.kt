package ca.u11.flowwrite.service

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * Creates a [MediaRecorder] tuned for speech-to-text upload: mono, 16kHz,
 * ~32kbps AAC.
 *
 * Whisper (and every other STT backend) downsamples audio to 16kHz mono
 * internally regardless of input quality, so recording at hi-fi settings
 * (44.1kHz stereo, 128kbps — the old config) only produces a bigger file to
 * upload. Shrinking the recording cuts upload time — the dominant
 * client-controllable chunk of "stop talking → text appears" latency —
 * without losing anything the transcription pipeline can use.
 *
 * Shared by [MicService] (bubble-tap dictation) and the in-panel dictation in
 * `GenerateActivity` so both stay in sync.
 */
@Suppress("DEPRECATION")
object SpeechRecorder {
    private const val SAMPLE_RATE_HZ = 16_000
    private const val BIT_RATE_BPS = 32_000

    /** Returns a prepared (but not started) recorder writing to [outputFile]. */
    fun create(context: Context, outputFile: File): MediaRecorder {
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        return recorder.apply {
            setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioChannels(1)
            setAudioSamplingRate(SAMPLE_RATE_HZ)
            setAudioEncodingBitRate(BIT_RATE_BPS)
            setOutputFile(outputFile.absolutePath)
            prepare()
        }
    }
}
