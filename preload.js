const { contextBridge, ipcRenderer } = require('electron');

// Exposing a secure object called 'secteurV' to the live website
contextBridge.exposeInMainWorld('secteurV', {
    // Create a function the website can call to send data to main.js
    sendRPCData: (data) => ipcRenderer.send('update-rpc', data)
});