package ca.u11.flowwrite.ui.screens

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.BubbleChart
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

/**
 * Settings tab — always accessible from HomeScreen bottom nav.
 *
 * Shows the same permission checklist as the onboarding PermissionsScreen but
 * without the "Continue" button, so users can check and fix permissions at any
 * time.  Also shows read-only info about the app version.
 */
@Composable
fun SettingsTab(innerPadding: PaddingValues) {
    val context = LocalContext.current

    // Privacy sub-screen
    var showPrivacy by remember { mutableStateOf(false) }
    if (showPrivacy) {
        PrivacyScreen(onBack = { showPrivacy = false })
        return
    }

    // Prominent disclosure dialog gating the accessibility permission
    var showAccessibilityDisclosure by remember { mutableStateOf(false) }
    if (showAccessibilityDisclosure) {
        AccessibilityDisclosureDialog(
            onDismiss = { showAccessibilityDisclosure = false },
            onContinue = {
                showAccessibilityDisclosure = false
                context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            },
        )
    }

    // Re-evaluate permissions every time we return from a system settings screen
    var tick by remember { mutableIntStateOf(0) }

    val hasOverlay = remember(tick) { Settings.canDrawOverlays(context) }

    val hasAccessibility = remember(tick) {
        val am = context.getSystemService(AccessibilityManager::class.java)
        am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.id.startsWith(context.packageName) }
    }

    val hasMic = remember(tick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }

    val hasNotifications = remember(tick) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else true
    }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { tick++ }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { tick++ }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(8.dp))

        SectionHeader("Permissions")
        Spacer(Modifier.height(8.dp))

        PermRow(
            icon        = Icons.Filled.BubbleChart,
            title       = "Display over other apps",
            description = "Required for the floating bubble",
            granted     = hasOverlay,
            onGrant = {
                context.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${context.packageName}"),
                    )
                )
                tick++
            },
        )

        PermRow(
            icon        = Icons.Filled.Mic,
            title       = "Microphone",
            description = "Records your voice for dictation",
            granted     = hasMic,
            onGrant     = { micLauncher.launch(Manifest.permission.RECORD_AUDIO) },
        )

        PermRow(
            icon        = Icons.Filled.Accessibility,
            title       = "Accessibility service",
            description = "Inserts text directly into any field",
            granted     = hasAccessibility,
            onGrant = {
                // Prominent disclosure FIRST (required by Google Play policy)
                showAccessibilityDisclosure = true
            },
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermRow(
                icon        = Icons.Filled.Notifications,
                title       = "Notifications",
                description = "Shows the recording foreground service",
                granted     = hasNotifications,
                onGrant     = { notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
            )
        }

        Spacer(Modifier.height(20.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(20.dp))

        SectionHeader("How it works")
        Spacer(Modifier.height(8.dp))

        InfoCard(
            icon  = Icons.Filled.BubbleChart,
            title = "Tap bubble → Dictate",
            body  = "Single tap starts/stops voice recording. Whisper transcribes and polishes your words, then inserts them where you were typing.",
        )
        Spacer(Modifier.height(8.dp))
        InfoCard(
            icon  = Icons.Filled.Info,
            title = "Long-press bubble → Generate",
            body  = "Long-press opens the AI generation panel. Pick a template or type your own prompt — the result is inserted into the focused field.",
        )

        Spacer(Modifier.height(20.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(20.dp))

        SectionHeader("About")
        Spacer(Modifier.height(8.dp))

        // Privacy — opens the dedicated Privacy screen
        NavRow(
            icon        = Icons.Filled.Lock,
            title       = "Privacy",
            description = "How FlowWrite handles your voice and text",
            onClick     = { showPrivacy = true },
        )

        Spacer(Modifier.height(8.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            ),
            shape = RoundedCornerShape(14.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                AboutRow("App", "FlowWrite Mobile")
                AboutRow("Version", "1.0.0")
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

// ---------------------------------------------------------------------------
// Sub-composables
// ---------------------------------------------------------------------------

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
        color = MaterialTheme.colorScheme.primary,
    )
}

/**
 * Prominent disclosure shown BEFORE sending the user to enable the Accessibility
 * service.  Required by Google Play's Accessibility API / sensitive-permission
 * policy: clearly states what the service does and that it collects nothing.
 */
@Composable
private fun AccessibilityDisclosureDialog(onDismiss: () -> Unit, onContinue: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon  = { Icon(Icons.Filled.Accessibility, null, tint = MaterialTheme.colorScheme.primary) },
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

@Composable
private fun NavRow(
    icon: ImageVector,
    title: String,
    description: String,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface)
                Text(description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun PermRow(
    icon: ImageVector,
    title: String,
    description: String,
    granted: Boolean,
    onGrant: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        ),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (granted) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(26.dp),
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(8.dp))
            if (granted) {
                Icon(
                    Icons.Filled.CheckCircle,
                    contentDescription = "Granted",
                    tint = Color(0xFF2E7D32),
                    modifier = Modifier.size(22.dp),
                )
            } else {
                Icon(
                    Icons.Filled.Error,
                    contentDescription = "Not granted",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(4.dp))
                TextButton(onClick = onGrant) { Text("Enable") }
            }
        }
    }
}

@Composable
private fun InfoCard(icon: ImageVector, title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
        ),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Icon(
                icon, null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AboutRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(100.dp),
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
