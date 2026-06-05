// Preload script (CommonJS — required by Electron when sandbox is disabled).
// Exposes a tightly-scoped `window.flowwrite` bridge to the renderer so that
// React code never touches Node APIs or ipcRenderer directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowwrite', {
  // Popup lifecycle
  showPopup: () => ipcRenderer.invoke('show-popup'),
  hidePopup: () => ipcRenderer.invoke('hide-popup'),
  applyTemplate: (id) => ipcRenderer.invoke('apply-template', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (next) => ipcRenderer.invoke('save-settings', next),

  // Centralised API keys (admin-managed) pushed from the renderer to main.
  setApiKeys: (keys) => ipcRenderer.invoke('set-api-keys', keys),

  // Admin-managed free-plan weekly limits (read from Firestore, pushed here).
  setLimits: (l) => ipcRenderer.invoke('set-limits', l),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // User-defined style templates (few-shot examples)
  getUserTemplates: () => ipcRenderer.invoke('get-user-templates'),
  saveUserTemplate: (t) => ipcRenderer.invoke('save-user-template', t),
  deleteUserTemplate: (id) => ipcRenderer.invoke('delete-user-template', id),

  // Email templates (sender + style example + fixed signature)
  getEmailTemplates: () => ipcRenderer.invoke('get-email-templates'),
  saveEmailTemplate: (t) => ipcRenderer.invoke('save-email-template', t),
  deleteEmailTemplate: (id) => ipcRenderer.invoke('delete-email-template', id),

  // Unified templates (purpose + platform + style/email fields)
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  saveTemplate: (t) => ipcRenderer.invoke('save-template', t),
  deleteTemplate: (id) => ipcRenderer.invoke('delete-template', id),

  // App version string (for the Dashboard footer).
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Manual update check + install (auto-update also runs silently in the
  // background; this is the visible "Check for updates" button).
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },

  // Membership / usage limits
  setPlan: (plan) => ipcRenderer.invoke('set-plan', plan),
  setUsage: (u) => ipcRenderer.invoke('set-usage', u),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // Main routes each transcription's word count here (main window only) so an
  // authed renderer can record it in the user's cloud profile.
  onAudioWords: (cb) => {
    const listener = (_e, n) => cb(n);
    ipcRenderer.on('usage:audio-words', listener);
    return () => ipcRenderer.removeListener('usage:audio-words', listener);
  },

  // macOS permissions (Permissions tab in Settings)
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  requestMicrophone: () => ipcRenderer.invoke('request-microphone'),
  openPermissionSettings: (which) => ipcRenderer.invoke('open-permission-settings', which),

  // Navigation — open the main window on a specific route from any renderer
  // (e.g., the popup can open the Dashboard to prompt the user to sign in).
  openMain: (route) => ipcRenderer.invoke('open-main', route),

  // Cross-window auth sync.
  // Any window can notify the main process that auth state changed; the main
  // process forwards it to all other windows so they can reload/update.
  notifyAuthChange: (isSignedIn) => ipcRenderer.invoke('notify-auth-change', isSignedIn),
  onAuthChange: (cb) => {
    const listener = (_e, isSignedIn) => cb(isSignedIn);
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },

  // Auth — only Google OAuth is supported. Renderer calls signIn() with the
  // OAuth client ID from firebaseConfig.js; we return the Google id_token
  // which the renderer hands to Firebase via signInWithCredential.
  googleSignIn: (payload) => ipcRenderer.invoke('google-sign-in', payload),

  // Claude generation (Architecture A — key lives in main process).
  // claudeClient.js uses these two channels to stream text back to the popup.
  generateText: (payload) => ipcRenderer.invoke('generate-text', payload),
  onGenerateChunk: (cb) => {
    const listener = (_e, chunk) => cb(chunk);
    ipcRenderer.on('generate:chunk', listener);
    // Return a cleanup fn so the caller can unsubscribe.
    return () => ipcRenderer.removeListener('generate:chunk', listener);
  },

  // Auto-fill
  autofillText: (payload) => ipcRenderer.invoke('autofill-text', payload),
  // Popup "Insert" — hides the popup, restores focus to the previous app,
  // then pastes the generated text into the field the user was in.
  insertText: (payload) => ipcRenderer.invoke('insert-text', payload),

  // Voice dictation — renderer records mic audio and sends the bytes here;
  // main transcribes (OpenAI Whisper) + cleans up grammar, returns the text.
  // Payload: { audio: Uint8Array, mimeType: string }
  transcribeAudio: (payload) => ipcRenderer.invoke('transcribe-audio', payload),

  // Lifetime transcriber usage (e.g. { words }).
  getTranscriberStats: () => ipcRenderer.invoke('get-transcriber-stats'),

  // Fn push-to-talk dictation bar. Main pushes start/stop (driven by the Fn
  // key); the bar records, transcribes, then inserts at the cursor.
  onDictationStart: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('dictation:start', listener);
    return () => ipcRenderer.removeListener('dictation:start', listener);
  },
  onDictationStop: (cb) => {
    const listener = (_e, opts) => cb(opts || {});
    ipcRenderer.on('dictation:stop', listener);
    return () => ipcRenderer.removeListener('dictation:stop', listener);
  },
  dictationInsert: (text) => ipcRenderer.invoke('dictation-insert', text),
  dictationCancel: () => ipcRenderer.invoke('dictation-cancel'),

  // Popup context — main pushes the detected field/app info to the popup
  // immediately before showing it.
  onPopupContext: (cb) => {
    const listener = (_e, ctx) => cb(ctx);
    ipcRenderer.on('popup:context', listener);
    return () => ipcRenderer.removeListener('popup:context', listener);
  },
});
