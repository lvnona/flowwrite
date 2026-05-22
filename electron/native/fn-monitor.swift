// fn-monitor — a tiny background helper that watches the physical Fn / Globe
// key and reports its state to FlowWrite over stdout.
//
// Why this exists
//   Electron's globalShortcut API can only register normal accelerators and
//   fires once on key-press — it cannot see the Fn key and cannot tell when a
//   key is being HELD vs released. Push-to-talk needs both edges of a key that
//   Electron can't observe, so we monitor it natively here.
//
// How it works
//   We install a PASSIVE global event monitor for .flagsChanged events. The
//   physical Fn / Globe key reports keyCode 63 (kVK_Function); when it is held
//   the .function modifier flag is set, and when released it clears. Because
//   the monitor is passive it never consumes the event, so Fn continues to work
//   for brightness/volume/etc. and for Fn+arrow navigation.
//
// Output protocol (one token per line, unbuffered):
//   DOWN   Fn pressed
//   UP     Fn released
//
// Permissions
//   Global keyboard monitoring requires the binary to be granted Input
//   Monitoring (System Settings → Privacy & Security → Input Monitoring). macOS
//   prompts the first time the monitor is installed. Until granted, no events
//   are reported.
//
// Lifecycle
//   Exits automatically when its stdin reaches EOF (i.e. the parent FlowWrite
//   process has gone away), so it never lingers as an orphan.

import Cocoa

setbuf(stdout, nil) // unbuffered: emit each line immediately

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no Dock icon, no menu bar, background agent

// kVK_Function — the physical Fn / Globe key.
let kFnKeyCode: UInt16 = 63

var fnIsDown = false

func handleFlags(_ event: NSEvent) {
    guard event.keyCode == kFnKeyCode else { return }
    let down = event.modifierFlags.contains(.function)
    if down && !fnIsDown {
        fnIsDown = true
        print("DOWN")
    } else if !down && fnIsDown {
        fnIsDown = false
        print("UP")
    }
}

// Global monitor: fires while other apps are focused (our normal case).
NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged]) { event in
    handleFlags(event)
}
// Local monitor: harmless completeness in case our own (UI-less) process ever
// receives the event; must return the event so nothing is swallowed.
NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged]) { event in
    handleFlags(event)
    return event
}

// Quit when the parent closes our stdin pipe (parent process exited).
DispatchQueue.global(qos: .utility).async {
    _ = FileHandle.standardInput.readDataToEndOfFile()
    exit(0)
}

app.run()
