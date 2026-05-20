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

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // User-defined style templates (few-shot examples)
  getUserTemplates: () => ipcRenderer.invoke('get-user-templates'),
  saveUserTemplate: (t) => ipcRenderer.invoke('save-user-template', t),
  deleteUserTemplate: (id) => ipcRenderer.invoke('delete-user-template', id),

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

  // Popup context — main pushes the detected field/app info to the popup
  // immediately before showing it.
  onPopupContext: (cb) => {
    const listener = (_e, ctx) => cb(ctx);
    ipcRenderer.on('popup:context', listener);
    return () => ipcRenderer.removeListener('popup:context', listener);
  },
});
