// Acquire a microphone MediaStream using the user's preferred input device
// (saved in Settings → Audio transcriber → Microphone input).
//
// If a specific device is chosen but it's no longer available (e.g. Bluetooth
// headphones were disconnected), getUserMedia with an `exact` deviceId throws
// OverconstrainedError — we catch that and fall back to the system default,
// which on macOS/Windows reverts to the built-in mic. This is the "if the
// connected device disappears, go back to built-in" behaviour.

export async function getMicStream() {
  let deviceId = '';
  try {
    const settings = await window.flowwrite?.getSettings?.();
    deviceId = settings?.micDeviceId || '';
  } catch {
    /* fall through to default */
  }

  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
    } catch {
      /* selected device unavailable — fall back to the default below */
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}
