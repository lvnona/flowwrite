package ca.u11.flowwrite.service

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-wide state bus between BubbleService, MicService, and
 * FwAccessibilityService.  All three services run in the same process so a
 * Kotlin object (singleton) is the simplest, zero-dependency solution.
 *
 * Flow:
 *   BubbleService tap ──► RecordingBus.startRecording()
 *                                │
 *                         MicService watches [state]
 *                                │
 *                         Records audio, calls proxy
 *                                │
 *                         RecordingBus.emitText(text)
 *                                │
 *                    FwAccessibilityService.insertText(text)
 */
object RecordingBus {

    // -----------------------------------------------------------------------
    // State visible to BubbleService for rendering
    // -----------------------------------------------------------------------

    enum class State { IDLE, RECORDING, PROCESSING }

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state.asStateFlow()

    fun setState(s: State) { _state.value = s }

    // -----------------------------------------------------------------------
    // Commands from BubbleService → MicService
    // -----------------------------------------------------------------------

    enum class Command { START, STOP }

    private val _commands = MutableSharedFlow<Command>(extraBufferCapacity = 1)
    val commands: SharedFlow<Command> = _commands.asSharedFlow()

    fun sendCommand(cmd: Command) { _commands.tryEmit(cmd) }

    // -----------------------------------------------------------------------
    // Transcribed text from MicService → FwAccessibilityService
    // (handled inline via FwAccessibilityService.instance, but kept here as
    //  an observable for future UI feedback / history features)
    // -----------------------------------------------------------------------

    private val _text = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val text: SharedFlow<String> = _text.asSharedFlow()

    fun emitText(t: String) { _text.tryEmit(t) }

    // -----------------------------------------------------------------------
    // Error messages for the bubble to toast
    // -----------------------------------------------------------------------

    private val _error = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val error: SharedFlow<String> = _error.asSharedFlow()

    fun emitError(msg: String) { _error.tryEmit(msg) }

    // -----------------------------------------------------------------------
    // Input-field focus — true when an editable field is focused anywhere on
    // screen.  BubbleService shows/hides based on this flag.
    // -----------------------------------------------------------------------

    private val _inputFocused = MutableStateFlow(false)
    val inputFocused: StateFlow<Boolean> = _inputFocused.asStateFlow()

    fun setInputFocused(focused: Boolean) { _inputFocused.value = focused }

    // -----------------------------------------------------------------------
    // Generate panel open — while true the bubble is suppressed (the panel has
    // its own mic) and the accessibility service ignores events.
    // -----------------------------------------------------------------------

    private val _panelOpen = MutableStateFlow(false)
    val panelOpen: StateFlow<Boolean> = _panelOpen.asStateFlow()

    fun setPanelOpen(open: Boolean) { _panelOpen.value = open }
}
