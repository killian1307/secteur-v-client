const { contextBridge, ipcRenderer } = require('electron');

// Exposing a secure object called 'secteurV' to the live website
contextBridge.exposeInMainWorld('secteurV', {
    // Create a function the website can call to send data to main.js
    sendRPCData: (data) => ipcRenderer.send('update-rpc', data),

    // Function to toggle startup
    toggleAutoStart: (enable) => ipcRenderer.send('toggle-auto-start', enable),

    // Ask the backend for the current status
    getAutoStartStatus: () => ipcRenderer.invoke('get-auto-start-status'),

    // Functions to toggle start minimized
    getStartMinimizedStatus: () => ipcRenderer.invoke('get-start-minimized'),
    toggleStartMinimized: (value) => ipcRenderer.send('toggle-start-minimized', value),

    // Catch the toggle event from main.js and send it to the PHP UI
    onOverlayToggle: (callback) => ipcRenderer.on('overlay-mode-toggled', (event, isInteractive) => callback(isInteractive)),

    // --- OVERLAY COMMUNICATION CHANNELS ---
    // Dashboard tells main.js that the user logged in
    notifyLogin: () => ipcRenderer.send('user-logged-in'),
    
    // Overlay listens for the command to refresh its data
    onUpdateOverlay: (callback) => ipcRenderer.on('update-overlay-data', () => callback()),

    // --- OVERLAY SETTINGS ---
    getOverlaySettings: () => ipcRenderer.invoke('get-overlay-settings'),
    toggleOverlay: (enable) => ipcRenderer.send('toggle-overlay', enable),
    setOverlayVolume: (vol) => ipcRenderer.send('set-overlay-volume', vol),
    toggleOverlayMute: (mute) => ipcRenderer.send('toggle-overlay-mute', mute),
});