package ca.u11.flowwrite.ui.screens

import android.content.Context
import android.content.Intent
import android.provider.Settings
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
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.BubbleChart
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ca.u11.flowwrite.MainViewModel
import ca.u11.flowwrite.data.UserProfile
import ca.u11.flowwrite.service.BubbleService

private const val FREE_GENERATIONS = 50
private const val FREE_AUDIO_WORDS = 2500

@Composable
fun DashboardTab(vm: MainViewModel, innerPadding: PaddingValues) {
    val profile  by vm.profile.collectAsState()
    val context  = LocalContext.current

    var bubbleRunning by remember { mutableStateOf(BubbleService.isRunning) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(8.dp))

        when (val p = profile) {
            null -> {
                Spacer(Modifier.height(48.dp))
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            else -> {
                // Plan + email
                PlanCard(p)
                Spacer(Modifier.height(16.dp))

                // Weekly usage
                UsageCard(
                    icon    = Icons.Filled.AutoFixHigh,
                    label   = "Generations this week",
                    current = p.generationsThisWeek,
                    limit   = if (p.plan == "pro") null else FREE_GENERATIONS,
                )
                Spacer(Modifier.height(10.dp))
                UsageCard(
                    icon    = Icons.Filled.RecordVoiceOver,
                    label   = "Audio words this week",
                    current = p.audioWordsThisWeek,
                    limit   = if (p.plan == "pro") null else FREE_AUDIO_WORDS,
                )
                Spacer(Modifier.height(10.dp))

                // All-time stats
                AllTimeCard(p)
            }
        }

        Spacer(Modifier.height(20.dp))

        // Bubble control
        BubbleCard(
            isRunning            = bubbleRunning,
            hasOverlayPermission = Settings.canDrawOverlays(context),
            onLaunch = {
                context.startForegroundService(BubbleService.startIntent(context))
                bubbleRunning = true
            },
            onStop = {
                context.startService(BubbleService.stopIntent(context))
                bubbleRunning = false
            },
        )

        Spacer(Modifier.height(20.dp))
    }
}

// ---------------------------------------------------------------------------
// Sub-composables
// ---------------------------------------------------------------------------

@Composable
private fun PlanCard(profile: UserProfile) {
    val isPro = profile.plan == "pro"
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isPro)
                MaterialTheme.colorScheme.secondaryContainer
            else
                MaterialTheme.colorScheme.surfaceVariant,
        ),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (isPro) Icons.Filled.Star else Icons.Filled.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    if (isPro) "Pro Plan" else "Free Plan",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (profile.email.isNotBlank()) {
                    Text(
                        profile.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun UsageCard(
    icon: ImageVector,
    label: String,
    current: Int,
    limit: Int?,
) {
    val fraction = if (limit != null && limit > 0) current.toFloat() / limit.toFloat() else 0f

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (limit == null) "$current / ∞" else "$current / $limit",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = if (fraction > 0.85f) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurface,
                )
            }
            if (limit != null) {
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { fraction.coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp)),
                    color = if (fraction > 0.85f) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AllTimeCard(profile: UserProfile) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
        ),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            AllTimeStat(
                label = "All-time generations",
                value = profile.allTimeUsage.toString(),
                modifier = Modifier.weight(1f),
            )
            AllTimeStat(
                label = "All-time audio words",
                value = profile.allTimeAudioWords.toString(),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AllTimeStat(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun BubbleCard(
    isRunning: Boolean,
    hasOverlayPermission: Boolean,
    onLaunch: () -> Unit,
    onStop: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.BubbleChart,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "Floating bubble",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        if (isRunning)
                            "Running — tap to dictate · long-press to generate"
                        else
                            "Tap to dictate · long-press for AI generation",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            if (!hasOverlayPermission) {
                Text(
                    "⚠ Grant \"Display over other apps\" permission in Settings tab",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            } else if (isRunning) {
                Button(
                    onClick = onStop,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) {
                    Icon(Icons.Filled.Stop, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Stop bubble")
                }
            } else {
                Button(onClick = onLaunch, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.BubbleChart, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Launch bubble")
                }
            }
        }
    }
}
