package ca.u11.flowwrite.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ca.u11.flowwrite.MainViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Onboarding — animated walkthrough of the two core flows
// ---------------------------------------------------------------------------

@Composable
fun OnboardingScreen(vm: MainViewModel) {
    val pageCount = 3
    val pagerState = rememberPagerState(pageCount = { pageCount })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == pageCount - 1

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))

        HorizontalPager(state = pagerState, modifier = Modifier.weight(1f)) { index ->
            when (index) {
                0 -> OnboardPage(
                    title = "Dictate in an instant",
                    body  = "Tap the mic and just talk. FlowWrite turns your voice into clean, punctuated text — right where you're typing.",
                ) { DictationDemo() }

                1 -> OnboardPage(
                    title = "Generate, don't write",
                    body  = "Give a topic, pick a style, and it's ready in seconds — custom text, translation, or personalized templates.",
                ) { GenerateDemo() }

                else -> OnboardPage(
                    title = "Templates for everywhere",
                    body  = "Facebook, Instagram, messages, email and more. No need to invent or write long posts — your topic, your style, ready to go.",
                ) { PlatformsDemo() }
            }
        }

        // Dot indicators
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(vertical = 20.dp),
        ) {
            repeat(pageCount) { i ->
                val color by animateColorAsState(
                    targetValue = if (i == pagerState.currentPage)
                        MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surfaceVariant,
                    label = "dot_$i",
                )
                Box(
                    Modifier
                        .size(if (i == pagerState.currentPage) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(color),
                )
            }
        }

        Button(
            onClick = {
                if (isLastPage) vm.onboardingComplete()
                else scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Text(if (isLastPage) "Get Started" else "Next", style = MaterialTheme.typography.bodyLarge)
        }
        Spacer(Modifier.height(8.dp))
    }
}

// ---------------------------------------------------------------------------
// Page shell: animated demo on top, title + body below
// ---------------------------------------------------------------------------

@Composable
private fun OnboardPage(title: String, body: String, demo: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 260.dp)
                .weight(1f, fill = false),
            contentAlignment = Alignment.Center,
        ) { demo() }

        Spacer(Modifier.height(28.dp))
        Text(
            title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp),
        )
    }
}

// ---------------------------------------------------------------------------
// Demo 1 — dictation: pulsing mic + voice typing into a field
// ---------------------------------------------------------------------------

@Composable
private fun DictationDemo() {
    val phrases = listOf(
        "Hey! Running five minutes late — see you soon.",
        "Don't forget milk and eggs on the way home.",
    )
    var phrase by remember { mutableIntStateOf(0) }
    var typed by remember { mutableStateOf("") }

    LaunchedEffectLoop {
        val text = phrases[phrase]
        typed = ""
        delay(700)
        for (i in 1..text.length) { typed = text.substring(0, i); delay(34) }
        delay(1500)
        phrase = (phrase + 1) % phrases.size
    }

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        MicPulse()
        Spacer(Modifier.height(28.dp))
        DemoField(
            label = "Message",
            text = typed,
            caret = true,
            minHeight = 72.dp,
        )
    }
}

@Composable
private fun MicPulse() {
    val t = rememberInfiniteTransition(label = "mic")
    val ring by t.animateFloat(
        initialValue = 1f, targetValue = 2.3f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart),
        label = "ring",
    )
    val ringAlpha by t.animateFloat(
        initialValue = 0.45f, targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart),
        label = "ringAlpha",
    )
    val tap by t.animateFloat(
        initialValue = 1f, targetValue = 0.92f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
        label = "tap",
    )

    Box(contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(92.dp)
                .graphicsLayer { scaleX = ring; scaleY = ring; alpha = ringAlpha }
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
        )
        Box(
            Modifier
                .size(92.dp)
                .graphicsLayer { scaleX = tap; scaleY = tap }
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Mic, contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(44.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Demo 2 — generate: topic → highlighted template → polished post types out
// ---------------------------------------------------------------------------

private data class Sample(val style: String, val post: String)

@Composable
private fun GenerateDemo() {
    val topic = "weekend hiking trip"
    val samples = listOf(
        Sample("Instagram", "Chased the sunrise on the ridge 🌄 Lungs burning, soul full — worth every step. #hiking #weekendvibes"),
        Sample("Facebook",  "Spent the weekend hiking with great friends — fresh air, good laughs, and views that don't quit. Already planning the next one!"),
        Sample("Email",     "Subject: Quick recap\n\nHi team — recharged after a weekend hiking trip and ready to dive back in."),
    )
    var idx by remember { mutableIntStateOf(0) }
    var typed by remember { mutableStateOf("") }

    LaunchedEffectLoop {
        val post = samples[idx].post
        typed = ""
        delay(900)
        for (i in 1..post.length) { typed = post.substring(0, i); delay(18) }
        delay(1700)
        idx = (idx + 1) % samples.size
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        DemoField(label = "Topic", text = topic, caret = false, minHeight = 44.dp)
        Spacer(Modifier.height(10.dp))

        // Style chips with the active one highlighted
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            samples.forEachIndexed { i, s ->
                val active = i == idx
                val bg by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surfaceVariant,
                    label = "chipbg_$i",
                )
                val fg = if (active) MaterialTheme.colorScheme.onPrimary
                else MaterialTheme.colorScheme.onSurfaceVariant
                Text(
                    s.style,
                    style = MaterialTheme.typography.labelMedium,
                    color = fg,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(bg)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        DemoField(label = "Ready-to-post", text = typed, caret = true, minHeight = 96.dp)
    }
}

// ---------------------------------------------------------------------------
// Demo 3 — platforms grid
// ---------------------------------------------------------------------------

@Composable
private fun PlatformsDemo() {
    val rows = listOf(
        listOf("Instagram", "Facebook", "LinkedIn"),
        listOf("Messages", "WhatsApp", "Email"),
        listOf("Notes", "Reddit", "X"),
    )
    val t = rememberInfiniteTransition(label = "plat")
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        rows.forEachIndexed { r, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEachIndexed { c, name ->
                    val phase = (r * 3 + c) * 220
                    val glow by t.animateFloat(
                        initialValue = 0.5f, targetValue = 1f,
                        animationSpec = infiniteRepeatable(
                            tween(1100, delayMillis = phase % 1100, easing = LinearEasing),
                            RepeatMode.Reverse,
                        ),
                        label = "glow_${r}_$c",
                    )
                    Text(
                        name,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .graphicsLayer { alpha = glow }
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** A small mock text-field card used by the demos. */
@Composable
private fun DemoField(label: String, text: String, caret: Boolean, minHeight: androidx.compose.ui.unit.Dp) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(4.dp))
        Box(Modifier.fillMaxWidth().heightIn(min = minHeight)) {
            Text(
                text + if (caret && text.isNotEmpty()) "▎" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.wrapContentHeight(),
            )
        }
    }
}

/** Runs [block] forever, restarting when it returns. */
@Composable
private fun LaunchedEffectLoop(block: suspend () -> Unit) {
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) block()
    }
}
