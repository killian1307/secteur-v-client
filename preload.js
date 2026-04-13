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
    toggleStartMinimized: (value) => ipcRenderer.send('toggle-start-minimized', value)
});