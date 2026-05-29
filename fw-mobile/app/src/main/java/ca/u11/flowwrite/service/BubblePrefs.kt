package ca.u11.flowwrite.service

import android.content.Context

/**
 * Tiny persistent flag remembering whether the user wants the floating bubble
 * running.  Used by [BootReceiver] to restore the bubble after a reboot.
 */
object BubblePrefs {
    private const val FILE = "fw_prefs"
    private const val KEY_ENABLED = "bubble_enabled"

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .getBoolean(KEY_ENABLED, false)
}
