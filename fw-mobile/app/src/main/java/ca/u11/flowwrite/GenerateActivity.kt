package ca.u11.flowwrite

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import ca.u11.flowwrite.data.PromptBuilder
import ca.u11.flowwrite.data.Template
import ca.u11.flowwrite.service.FwAccessibilityService
import ca.u11.flowwrite.service.RecordingBus
import ca.u11.flowwrite.ui.theme.FlowWriteTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Transparent bottom-sheet shown when the user long-presses the floating bubble.
 *
 * Flow (matches desktop):
 *   1. The bubble captures the user's current field text and passes it as
 *      [EXTRA_DRAFT] — this is the user's TOPIC / draft.
 *   2. The user picks a template (grouped by purpose).  The template's content
 *      is the STYLE; the draft is the TOPIC.  [PromptBuilder] combines them.
 *   3. The AI rewrites the draft in the template's style → result is inserted
 *      back into the original field (replacing the draft).
 *
 * "Polish my text" applies a plain rewrite with no template.
 */
class GenerateActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FlowWriteTheme {
                val vm: GenerateViewModel = viewModel()
                GenerateSheet(vm = vm, onDone = { finish() })
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Suppress the floating bubble while the panel is up (panel has its own mic)
        RecordingBus.setPanelOpen(true)
    }

    override fun onStop() {
        // Clear suppression as soon as the panel leaves the foreground — more
        // reliable than onDestroy (which the system may skip), so the bubble can
        // never get stuck hidden.
        RecordingBus.setPanelOpen(false)
        super.onStop()
    }

    override fun onDestroy() {
        RecordingBus.setPanelOpen(false)
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DRAFT = "ca.u11.flowwrite.DRAFT"
    }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class GenerateViewModel(app: Application) : AndroidViewModel(app) {

    private val fwApp = app as FlowWriteApp

    private val _templates = MutableStateFlow<List<Template>>(emptyList())
    val templates: StateFlow<List<Template>> = _templates.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _result = MutableStateFlow<String?>(null)
    val result: StateFlow<String?> = _result.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // --- In-panel dictation -------------------------------------------------

    /** The user's topic text. Bound to the panel's "Your text" field. */
    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _isTranscribing = MutableStateFlow(false)
    val isTranscribing: StateFlow<Boolean> = _isTranscribing.asStateFlow()

    private var recorder: android.media.MediaRecorder? = null
    private var audioFile: java.io.File? = null

    init {
        val uid = fwApp.auth.currentUser?.uid
        if (uid != null) {
            viewModelScope.launch {
                fwApp.templateRepo.templatesFlow(uid)
                    .catch { /* ignore */ }
                    .collectLatest { _templates.value = it }
            }
        }
    }

    fun setDraft(text: String) { _draft.value = text }

    /** Tap the panel mic: start recording, or stop + transcribe into the draft. */
    fun toggleDictation() {
        if (_isRecording.value) stopAndTranscribe() else startRecording()
    }

    private fun startRecording() {
        val file = java.io.File(fwApp.cacheDir, "fw_panel_${System.currentTimeMillis()}.m4a")
        audioFile = file
        try {
            recorder = createRecorder().apply {
                setAudioSource(android.media.MediaRecorder.AudioSource.VOICE_RECOGNITION)
                setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128_000)
                setAudioSamplingRate(44_100)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            _isRecording.value = true
        } catch (e: Exception) {
            _error.value = "Couldn't start microphone: ${e.message}"
            recorder?.runCatching { release() }
            recorder = null
        }
    }

    private fun stopAndTranscribe() {
        _isRecording.value = false
        recorder?.runCatching { stop() }
        recorder?.runCatching { release() }
        recorder = null
        val file = audioFile ?: return
        if (!file.exists()) return

        viewModelScope.launch {
            _isTranscribing.value = true
            _error.value = null
            try {
                val result = withContext(kotlinx.coroutines.Dispatchers.IO) { fwApp.api.transcribe(file) }
                // Append the transcript to whatever is already in the draft
                val cur = _draft.value.trim()
                _draft.value = if (cur.isEmpty()) result.text else "$cur ${result.text}"
                val uid = fwApp.auth.currentUser?.uid
                if (uid != null) {
                    withContext(kotlinx.coroutines.Dispatchers.IO) {
                        fwApp.profileRepo.incrementAudioWords(uid, result.words)
                    }
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Transcription failed"
            } finally {
                _isTranscribing.value = false
                file.delete()
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun createRecorder(): android.media.MediaRecorder =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S)
            android.media.MediaRecorder(fwApp)
        else android.media.MediaRecorder()

    override fun onCleared() {
        recorder?.runCatching { release() }
        recorder = null
        audioFile?.delete()
        super.onCleared()
    }

    /**
     * Generate using the full desktop-style controls. [template] is optional —
     * when provided, its content is used as the style example.
     */
    fun generate(
        contentType: String,
        tone: String,
        length: String,
        translateTo: String,
        template: Template?,
    ) = runGeneration {
        val prompt = PromptBuilder.build(_draft.value, contentType, tone, length, translateTo, template)
        val out = fwApp.api.generate(prompt).text
        PromptBuilder.appendSignature(out, template)
    }

    private fun runGeneration(block: suspend () -> String) {
        if (_isGenerating.value) return
        viewModelScope.launch {
            _isGenerating.value = true
            _error.value = null
            _result.value = null
            try {
                _result.value = block()
                val uid = fwApp.auth.currentUser?.uid
                if (uid != null) fwApp.profileRepo.incrementGeneration(uid)
            } catch (e: Exception) {
                _error.value = e.message ?: "Generation failed"
            } finally {
                _isGenerating.value = false
            }
        }
    }

    fun clearResult() { _result.value = null; _error.value = null }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GenerateSheet(vm: GenerateViewModel, onDone: () -> Unit) {
    val templates      by vm.templates.collectAsState()
    val isGenerating   by vm.isGenerating.collectAsState()
    val result         by vm.result.collectAsState()
    val error          by vm.error.collectAsState()
    val draft          by vm.draft.collectAsState()
    val isRecording    by vm.isRecording.collectAsState()
    val isTranscribing by vm.isTranscribing.collectAsState()

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Desktop-style controls
    var contentType by remember { mutableStateOf("Message") }
    var tone        by remember { mutableStateOf("Professional") }
    var length      by remember { mutableStateOf("Medium") }
    var translateTo by remember { mutableStateOf("English") }

    val isTranslate = contentType == "Translate"

    // Templates matching the current content type (purpose)
    val matchingTemplates = remember(templates, contentType) {
        if (isTranslate) emptyList()
        else templates.filter { it.purpose.ifBlank { "Other" } == contentType }
    }

    ModalBottomSheet(onDismissRequest = onDone, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(horizontal = 20.dp),
        ) {
            Text(
                "FlowWrite",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(12.dp))

            when {
                result != null -> {
                    ResultSection(
                        result = result!!,
                        onCopy = { ctx ->
                            ctx.getSystemService(ClipboardManager::class.java)
                                .setPrimaryClip(ClipData.newPlainText("FlowWrite", result!!))
                            onDone()
                        },
                        onInsert = {
                            // Dismiss the panel FIRST so the original app's field
                            // regains focus, then insert into it (desktop-style).
                            FwAccessibilityService.instance?.insertTextDeferred(result!!)
                            onDone()
                        },
                        onAgain = { vm.clearResult() },
                    )
                }

                error != null -> {
                    Text("⚠ $error",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = { vm.clearResult() }) { Text("Try again") }
                }

                else -> {
                    // Draft (the user's topic — editable + dictatable)
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { vm.setDraft(it) },
                        label = { Text("Your text") },
                        placeholder = {
                            Text(if (isRecording) "Listening… tap mic to stop"
                                 else "Type or tap the mic to dictate…")
                        },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4,
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isGenerating && !isTranscribing,
                        trailingIcon = {
                            IconButton(
                                onClick = { vm.toggleDictation() },
                                enabled = !isGenerating && !isTranscribing,
                            ) {
                                when {
                                    isTranscribing -> CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                                    isRecording -> Icon(
                                        Icons.Filled.Stop, contentDescription = "Stop dictation",
                                        tint = MaterialTheme.colorScheme.error)
                                    else -> Icon(
                                        Icons.Filled.Mic, contentDescription = "Dictate",
                                        tint = MaterialTheme.colorScheme.primary)
                                }
                            }
                        },
                    )
                    Spacer(Modifier.height(12.dp))

                    // ── Content type ────────────────────────────────────────
                    ControlLabel("Type")
                    ChipRow(
                        options  = PromptBuilder.CONTENT_TYPES,
                        selected = contentType,
                        enabled  = !isGenerating,
                        onSelect = { contentType = it },
                    )

                    Spacer(Modifier.height(10.dp))

                    if (isTranslate) {
                        // ── Translate language picker ───────────────────────
                        ControlLabel("Translate to")
                        LanguageDropdown(
                            selected = translateTo,
                            enabled  = !isGenerating,
                            onSelect = { translateTo = it },
                        )
                    } else {
                        // ── Tone ────────────────────────────────────────────
                        ControlLabel("Tone")
                        ChipRow(
                            options  = PromptBuilder.TONES,
                            selected = tone,
                            enabled  = !isGenerating,
                            onSelect = { tone = it },
                        )
                        Spacer(Modifier.height(10.dp))
                        // ── Length ──────────────────────────────────────────
                        ControlLabel("Length")
                        ChipRow(
                            options  = PromptBuilder.LENGTHS,
                            selected = length,
                            enabled  = !isGenerating,
                            onSelect = { length = it },
                        )
                    }

                    Spacer(Modifier.height(14.dp))

                    // ── Generate (no template) ──────────────────────────────
                    Button(
                        onClick  = {
                            vm.generate(contentType, tone, length, translateTo, template = null)
                        },
                        enabled  = (draft.isNotBlank() || !isTranslate) && !isGenerating,
                        modifier = Modifier.fillMaxWidth(),
                        shape    = RoundedCornerShape(12.dp),
                    ) {
                        if (isGenerating) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Icon(Icons.Filled.AutoFixHigh, null, modifier = Modifier.size(18.dp))
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(if (isTranslate) "Translate" else "Generate")
                    }

                    // ── Templates for this type ─────────────────────────────
                    if (matchingTemplates.isNotEmpty()) {
                        Spacer(Modifier.height(16.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Spacer(Modifier.height(12.dp))
                        ControlLabel("Your $contentType templates")
                        Spacer(Modifier.height(8.dp))
                        LazyColumn(
                            modifier = Modifier.heightIn(max = 220.dp),
                            contentPadding = PaddingValues(bottom = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(matchingTemplates, key = { it.id }) { t ->
                                TemplateRow(
                                    template     = t,
                                    isGenerating = isGenerating,
                                    onUse        = {
                                        vm.generate(contentType, tone, length, translateTo, template = t)
                                    },
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun ControlLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(4.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChipRow(
    options: List<String>,
    selected: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { opt ->
            FilterChip(
                selected = selected == opt,
                onClick  = { if (enabled) onSelect(opt) },
                enabled  = enabled,
                label    = { Text(opt) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageDropdown(selected: String, enabled: Boolean, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(
            onClick = { if (enabled) expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(selected, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ArrowDropDown, contentDescription = "Choose language")
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.heightIn(max = 320.dp),
        ) {
            PromptBuilder.LANGUAGES.forEach { lang ->
                DropdownMenuItem(
                    text = { Text(lang) },
                    onClick = { onSelect(lang); expanded = false },
                )
            }
        }
    }
}

@Composable
private fun TemplateRow(template: Template, isGenerating: Boolean, onUse: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    template.name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                val sub = listOfNotNull(
                    template.purpose.takeIf { it.isNotBlank() },
                    template.platform.takeIf { it.isNotBlank() },
                ).joinToString(" · ")
                if (sub.isNotBlank()) {
                    Text(sub,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.width(8.dp))
            FilledTonalButton(
                onClick = onUse,
                enabled = !isGenerating,
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
            ) { Text("Use", style = MaterialTheme.typography.labelMedium) }
        }
    }
}

@Composable
private fun ResultSection(
    result: String,
    onCopy: (Context) -> Unit,
    onInsert: () -> Unit,
    onAgain: () -> Unit,
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                result,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier
                    .heightIn(max = 240.dp)
                    .verticalScroll(rememberScrollState()),
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { onCopy(context) }, modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Filled.ContentCopy, null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Copy")
                }
                Button(onClick = onInsert, modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Filled.AutoFixHigh, null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Insert")
                }
            }
            TextButton(onClick = onAgain, modifier = Modifier.align(Alignment.End)) {
                Text("Start over", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

