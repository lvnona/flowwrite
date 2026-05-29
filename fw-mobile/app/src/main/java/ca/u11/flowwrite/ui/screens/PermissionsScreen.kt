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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.BubbleChart
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import ca.u11.flowwrite.MainViewModel

@Composable
fun PermissionsScreen(vm: MainViewModel) {
    val context = LocalContext.current

    // A simple counter-based key so remember() blocks re-evaluate when we
    // return from a system settings screen.
    var tick by remember { mutableIntStateOf(0) }

    // --- check state of each permission ---

    val hasOverlay = remember(tick) {
        Settings.canDrawOverlays(context)
    }

    val hasAccessibility = remember(tick) {
        val am = context.getSystemService(AccessibilityManager::class.java)
        am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { info -> info.id.startsWith(context.packageName) }
    }

    val hasMic = remember(tick) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
    }

    val hasNotifications = remember(tick) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true // not required below Android 13
        }
    }

    // --- runtime permission launchers ---

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { tick++ }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { tick++ }

    // Auto-advance when all critical permissions are granted
    val allGranted = hasOverlay && hasAccessibility && hasMic && hasNotifications
    LaunchedEffect(allGranted) {
        if (allGranted) vm.permissionsComplete()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))

        Text(
            text = "Set up permissions",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "FlowWrite needs these to work properly",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(32.dp))

        // Overlay — opens system settings, no runtime dialog
        PermRow(
            icon = Icons.Filled.BubbleChart,
            title = "Display over other apps",
            description = "Required for the floating bubble",
            granted = hasOverlay,
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

        // Accessibility — opens system Accessibility settings
        PermRow(
            icon = Icons.Filled.Accessibility,
            title = "Accessibility service",
            description = "Inserts text into the focused field",
            granted = hasAccessibility,
            onGrant = {
                context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                tick++
            },
        )

        // Microphone — runtime dialog
        PermRow(
            icon = Icons.Filled.Mic,
            title = "Microphone",
            description = "Records your voice for dictation",
            granted = hasMic,
            onGrant = { micLauncher.launch(Manifest.permission.RECORD_AUDIO) },
        )

        // Post-notifications — Android 13+ only
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermRow(
                icon = Icons.Filled.Notifications,
                title = "Notifications",
                description = "Required to show the foreground service",
                granted = hasNotifications,
                onGrant = { notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
            )
        }

        Spacer(Modifier.height(32.dp))

        // Continue button — enabled once overlay + mic are granted (minimum viable)
        Button(
            onClick = { vm.permissionsComplete() },
            enabled = hasOverlay && hasMic,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            Text(
                text = when {
                    allGranted -> "Continue"
                    else -> "Continue anyway"
                },
                style = MaterialTheme.typography.bodyLarge,
            )
        }

        if (!allGranted) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = "You can grant remaining permissions later",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(16.dp))
    }
}

// ---------------------------------------------------------------------------
// Permission row component
// ---------------------------------------------------------------------------

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
            .padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (granted)
                    MaterialTheme.colorScheme.primary
                else
                    MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (granted) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = "Granted",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            } else {
                TextButton(onClick = onGrant) {
                    Text("Grant")
                }
            }
        }
    }
}
