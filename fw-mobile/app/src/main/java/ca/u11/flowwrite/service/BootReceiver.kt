package ca.u11.flowwrite.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Restarts the floating bubble after the device reboots — but only if the user
 * had it enabled AND the overlay permission is still granted.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) return

        if (!BubblePrefs.isEnabled(context)) return
        if (!Settings.canDrawOverlays(context)) return

        // BOOT_COMPLETED is an allowed exemption for starting a foreground service.
        context.startForegroundService(BubbleService.startIntent(context))
    }
}
