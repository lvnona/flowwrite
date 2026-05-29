package ca.u11.flowwrite.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.BubbleChart
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ca.u11.flowwrite.MainViewModel
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

private data class Page(
    val icon: ImageVector,
    val title: String,
    val body: String,
)

private val PAGES = listOf(
    Page(
        icon = Icons.Filled.BubbleChart,
        title = "Floating bubble",
        body = "A small bubble floats over all your apps. Tap it whenever you want to dictate — no switching apps needed.",
    ),
    Page(
        icon = Icons.Filled.Mic,
        title = "Speak naturally",
        body = "FlowWrite records your voice, sends it to AI, and returns polished text — punctuated and cleaned up automatically.",
    ),
    Page(
        icon = Icons.Filled.AutoFixHigh,
        title = "Lands in the right field",
        body = "Your words are inserted directly into whatever text field was focused — emails, messages, notes, anything.",
    ),
)

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@Composable
fun OnboardingScreen(vm: MainViewModel) {
    val pagerState = rememberPagerState(pageCount = { PAGES.size })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == PAGES.lastIndex

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.weight(1f),
        ) { index ->
            PageContent(PAGES[index])
        }

        // Dot indicators
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(vertical = 24.dp),
        ) {
            repeat(PAGES.size) { i ->
                val color by animateColorAsState(
                    targetValue = if (i == pagerState.currentPage)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.surfaceVariant,
                    label = "dot_$i",
                )
                Box(
                    modifier = Modifier
                        .size(if (i == pagerState.currentPage) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(color),
                )
            }
        }

        Button(
            onClick = {
                if (isLastPage) {
                    vm.onboardingComplete()
                } else {
                    scope.launch {
                        pagerState.animateScrollToPage(pagerState.currentPage + 1)
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            Text(
                text = if (isLastPage) "Get Started" else "Next",
                style = MaterialTheme.typography.bodyLarge,
            )
        }

        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun PageContent(page: Page) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = page.icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(88.dp),
        )
        Spacer(Modifier.height(28.dp))
        Text(
            text = page.title,
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = page.body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
    }
}
