package ca.u11.flowwrite

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import ca.u11.flowwrite.auth.AuthRepository
import ca.u11.flowwrite.data.ApiClient
import ca.u11.flowwrite.data.ApiKeyRepository
import ca.u11.flowwrite.data.ProfileRepository
import ca.u11.flowwrite.data.TemplateRepository

/**
 * Application-level singletons.
 *
 * Both the Activity (via MainViewModel) and the background services
 * (BubbleService, MicService) share the same AuthRepository and ApiClient so
 * there is only one Firebase Auth listener and one OkHttpClient across the
 * whole process.
 */
class FlowWriteApp : Application() {

    val auth         by lazy { AuthRepository(this) }
    val apiKeyRepo   by lazy { ApiKeyRepository() }
    val api          by lazy { ApiClient(apiKeyRepo) }
    val profileRepo  by lazy { ProfileRepository() }
    val templateRepo by lazy { TemplateRepository() }

    override fun onCreate() {
        super.onCreate()
        // Start listening to config/apiKeys immediately — same as the Electron
        // app's onSnapshot in App.jsx. Keys are ready before the first API call.
        apiKeyRepo.startListening()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val nm = getSystemService(NotificationManager::class.java)

        // Bubble foreground service (task 6)
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_BUBBLE,
                getString(R.string.notif_channel_bubble_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.notif_channel_bubble_desc) }
        )

        // Microphone recording foreground service (task 8)
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_MIC,
                getString(R.string.notif_channel_mic_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = getString(R.string.notif_channel_mic_desc) }
        )
    }

    companion object {
        const val CHANNEL_BUBBLE = "fw_bubble"
        const val CHANNEL_MIC   = "fw_mic"

        /** Convenience accessor for use inside Services and other non-Activity code. */
        fun get(context: Context): FlowWriteApp =
            context.applicationContext as FlowWriteApp
    }
}
