package ca.u11.flowwrite.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val FwColors = darkColorScheme(
    primary = FwPrimary,
    onPrimary = FwOnPrimary,
    secondary = FwSecondary,
    background = FwBackground,
    onBackground = FwOnBackground,
    surface = FwSurface,
    onSurface = FwOnBackground,
    surfaceVariant = FwSurfaceVariant,
    onSurfaceVariant = FwOnSurfaceMuted,
    error = FwError,
)

@Composable
fun FlowWriteTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FwColors,
        typography = FwTypography,
        content = content,
    )
}
