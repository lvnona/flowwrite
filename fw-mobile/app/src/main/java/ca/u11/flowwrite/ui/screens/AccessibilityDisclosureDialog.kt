package ca.u11.flowwrite.ui.screens

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/**
 * Prominent disclosure shown BEFORE the user is sent to the system
 * Accessibility settings screen.  Required by Google Play's Accessibility-API
 * / sensitive-permission policy: clearly states what the service does, that
 * it activates only on direct user action, and that it collects nothing.
 *
 * Used by both the first-run onboarding ([PermissionsScreen]) and the
 * in-app re-grant flow ([SettingsTab]) so the same wording is shown
 * everywhere the user can enable the service.
 */
@Composable
internal fun AccessibilityDisclosureDialog(
    onDismiss: () -> Unit,
    onContinue: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(Icons.Filled.Accessibility, null, tint = MaterialTheme.colorScheme.primary)
        },
        title = { Text("Enable text insertion") },
        text = {
            Text(
                "FlowWrite uses Android's Accessibility service for one purpose only: " +
                    "to place the text you dictate or generate into the field you're " +
                    "writing in, and to read that field when you ask FlowWrite to rewrite it.\n\n" +
                    "It runs only when you tap the FlowWrite bubble or Insert. It does NOT " +
                    "read your screen in the background, log keystrokes, monitor other apps, " +
                    "or collect or share any screen content.\n\n" +
                    "On the next screen, turn on “FlowWrite Dictation”.",
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = { TextButton(onClick = onContinue) { Text("Continue") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } },
    )
}
