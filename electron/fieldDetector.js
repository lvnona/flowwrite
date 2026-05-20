// Mouse-hover watcher + macOS Accessibility API field detection.
//
// HOVER WATCHER
//   Polls screen.getCursorScreenPoint every 120ms. Fires `onIdle(pos)` once the
//   cursor has been stationary for `idleMs` milliseconds.  No native dependency.
//
// FIELD DETECTION — macOS (AXUIElement via ffi-napi)
//   Uses ffi-napi to call into the ApplicationServices and CoreFoundation
//   frameworks directly, with no compiled native module. The bindings are loaded
//   lazily; if ffi-napi is not installed or the app is running on Windows, the
//   detector returns a best-effort context from contextReader.js instead.
//
//   Accessibility permission must be granted:
//     System Settings → Privacy & Security → Accessibility → FlowWrite ✓
//
// FIELD DETECTION — Windows
//   Not implemented here; contextReader.js provides app + window-title context.

import { screen } from 'electron';

// ─────────────────────────────────────────────────────────
// Hover watcher
// ─────────────────────────────────────────────────────────

let timer = null;
let lastPos = { x: -1, y: -1 };
let stationarySince = 0;
let firedForThisRest = false;

export function startHoverWatcher({ idleMs = 800, onIdle }) {
  stopHoverWatcher();
  timer = setInterval(() => {
    const pos = screen.getCursorScreenPoint();
    const now = Date.now();

    if (pos.x !== lastPos.x || pos.y !== lastPos.y) {
      lastPos = pos;
      stationarySince = now;
      firedForThisRest = false;
      return;
    }

    if (!firedForThisRest && now - stationarySince >= idleMs) {
      firedForThisRest = true;
      try { onIdle(pos); } catch (err) {
        console.error('[FlowWrite] hover onIdle threw:', err);
      }
    }
  }, 120);
}

export function stopHoverWatcher() {
  if (timer) { clearInterval(timer); timer = null; }
}

// ─────────────────────────────────────────────────────────
// macOS Accessibility API — ffi-napi bindings
// ─────────────────────────────────────────────────────────

// CF string encoding constant for UTF-8.
const kCFStringEncodingUTF8 = 0x08000100;
const kAXErrorSuccess = 0;

// Roles that represent editable text fields.
const TEXT_ROLES = new Set([
  'AXTextField',
  'AXTextArea',
  'AXComboBox',
  'AXSearchField',
  'AXSecureTextField',
]);

// Lazy-loaded bundle of ffi-napi bindings. `false` means "tried, unavailable".
let _axBindings = undefined;

async function loadAXBindings() {
  if (_axBindings !== undefined) return _axBindings;

  if (process.platform !== 'darwin') {
    _axBindings = false;
    return false;
  }

  try {
    // Dynamic imports so Electron doesn't choke if ffi-napi was never installed.
    const { default: ffi } = await import('ffi-napi');
    const { default: ref } = await import('ref-napi');

    // CFTypeRef is an opaque void pointer.
    const voidType = ref.types.void;
    const CFTypeRef = ref.refType(voidType);   // void*
    const CFTypeRefPtr = ref.refType(CFTypeRef); // void**

    const AS_PATH =
      '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices';
    const CF_PATH =
      '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation';

    const AS = ffi.Library(AS_PATH, {
      // Returns a system-wide AXUIElementRef (caller owns it, must CFRelease).
      AXUIElementCreateSystemWide: [CFTypeRef, []],
      // Fills *elementOut with the element at the given screen point. Returns AXError.
      AXUIElementCopyElementAtPosition: ['int', [CFTypeRef, 'float', 'float', CFTypeRefPtr]],
      // Copies an attribute value. The returned CFTypeRef is owned by the caller.
      AXUIElementCopyAttributeValue: ['int', [CFTypeRef, CFTypeRef, CFTypeRefPtr]],
    });

    const CF = ffi.Library(CF_PATH, {
      // Allocates a CFStringRef from a C string. Caller must CFRelease.
      CFStringCreateWithCString: [CFTypeRef, [CFTypeRef, 'string', 'uint32']],
      // Converts a CFStringRef to a C string. Returns true on success.
      CFStringGetCString: ['bool', [CFTypeRef, 'pointer', 'long', 'uint32']],
      // Returns the number of UTF-16 code units in a CFStringRef.
      CFStringGetLength: ['long', [CFTypeRef]],
      // Releases any CF object.
      CFRelease: ['void', [CFTypeRef]],
    });

    _axBindings = { ffi, ref, AS, CF, CFTypeRef, CFTypeRefPtr };
    console.info('[FlowWrite] macOS AX bindings loaded via ffi-napi');
  } catch (err) {
    console.warn('[FlowWrite] ffi-napi not available — AX detection disabled:', err.message);
    _axBindings = false;
  }

  return _axBindings;
}

// Create a CFStringRef from a JS string. Returns a Buffer holding the pointer.
// Caller must call CF.CFRelease(result) after use.
function makeCFString({ CF, ref }, str) {
  return CF.CFStringCreateWithCString(ref.NULL, str, kCFStringEncodingUTF8);
}

// Convert a CFStringRef buffer → JS string. Returns '' on failure.
function cfStringToJS({ CF }, cfStr) {
  if (!cfStr || cfStr.isNull()) return '';
  try {
    // Allocate a byte buffer large enough for any string we'll encounter.
    const len = CF.CFStringGetLength(cfStr);
    const buf = Buffer.alloc((len + 1) * 4); // up to 4 UTF-8 bytes per char
    const ok = CF.CFStringGetCString(cfStr, buf, buf.length, kCFStringEncodingUTF8);
    return ok ? buf.toString('utf8').replace(/\0+$/, '') : '';
  } catch {
    return '';
  }
}

// Read a single AX string attribute from an element. Caller must NOT release
// the element; we release only the temporary attribute CFString we create.
function readAXStringAttr(ax, element, attrName) {
  const { AS, CF, ref, CFTypeRef } = ax;
  const attrCF = makeCFString(ax, attrName);
  const valOut = ref.alloc(CFTypeRef);
  const err = AS.AXUIElementCopyAttributeValue(element, attrCF, valOut);
  CF.CFRelease(attrCF);
  if (err !== kAXErrorSuccess) return '';
  const valRef = valOut.deref();
  if (!valRef || valRef.isNull()) return '';
  const str = cfStringToJS(ax, valRef);
  CF.CFRelease(valRef);
  return str;
}

/**
 * Inspect the AX element at `position` on screen.
 *
 * @param {{x: number, y: number}} position  physical pixels (Electron coords)
 * @returns {Promise<{isTextField, role, fieldLabel, fieldPlaceholder} | null>}
 */
export async function detectFieldAX(position) {
  const ax = await loadAXBindings();
  if (!ax) return null;

  const { AS, CF, ref, CFTypeRef, CFTypeRefPtr } = ax;

  // Electron reports physical pixels; AX uses logical points. Divide by scaleFactor.
  const display = screen.getDisplayNearestPoint(position);
  const scale = display.scaleFactor || 1;
  const lx = position.x / scale;
  const ly = position.y / scale;

  const sysWide = AS.AXUIElementCreateSystemWide();
  if (!sysWide || sysWide.isNull()) return null;

  try {
    // Get the AX element at the cursor position.
    const elementOut = ref.alloc(CFTypeRef);
    const hitErr = AS.AXUIElementCopyElementAtPosition(sysWide, lx, ly, elementOut);
    if (hitErr !== kAXErrorSuccess) return null;

    const element = elementOut.deref();
    if (!element || element.isNull()) return null;

    try {
      // Read role first — only proceed for text fields.
      const role = readAXStringAttr(ax, element, 'AXRole');
      const isTextField = TEXT_ROLES.has(role);

      // Read the visible label from the best available attribute.
      let fieldLabel = '';
      for (const attr of ['AXDescription', 'AXTitle', 'AXLabel']) {
        fieldLabel = readAXStringAttr(ax, element, attr);
        if (fieldLabel) break;
      }

      // Placeholder text (not all apps expose this).
      const fieldPlaceholder = readAXStringAttr(ax, element, 'AXPlaceholderValue');

      // The surrounding value (existing text in the field) — useful context.
      const existingValue = readAXStringAttr(ax, element, 'AXValue');

      return { isTextField, role, fieldLabel, fieldPlaceholder, existingValue };
    } finally {
      CF.CFRelease(element);
    }
  } finally {
    CF.CFRelease(sysWide);
  }
}
