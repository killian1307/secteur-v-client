const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

const clientId = '1469011238552862764'; 
DiscordRPC.register(clientId);

let mainWindow;

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Secteur V - Client",
    icon: path.join(__dirname, 'build/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      // When loading live URLs, nodeIntegration must be false so malicious scripts can't access the user's computer.
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Define the filter
  const filter = {
    urls: ['*://secteur-v.letterk.me/*']
  };

  // Intercept outgoing requests and append custom tag to the User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    // Grab the default Chrome User-Agent and just add the tag to the end
    details.requestHeaders['User-Agent'] = session.defaultSession.getUserAgent() + ' SecteurV-Desktop-App';
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Load the URL normally
  mainWindow.loadURL('https://secteur-v.letterk.me');
}

// --- DISCORD RPC ---
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const startTimestamp = new Date(); // Tracks how long they've been playing

async function setActivity() {
  if (!rpc) return;

  rpc.setActivity({
    details: 'On the dashboard',      // First line
    state: 'Managing Brackets',       // Second line
    startTimestamp,                   // Adds an "elapsed time" timer
    
    // Large Image
    largeImageKey: 'pfp',             // Key of the large image asset
    largeImageText: 'Secteur V',      // Hover text for the large image
    
    // Small Image
    smallImageKey: 'secteurv',        // Key of the small image asset
    smallImageText: 'PlayerName - 1200 EDP', // Hover text for the small image
    
    instance: false,                  // Not a joinable multiplayer lobby
    
    // Buttons
    buttons: [
      {
        label: 'Check it out!',
        url: 'https://secteur-v.letterk.me'
      }
    ]
  });
}

rpc.on('ready', () => {

  console.log('✅ Discord RPC Connected and Ready!');
  console.log(`User: ${rpc.user.username}`);

  setActivity();
  
  // Refreshes the activity every 15 seconds
  setInterval(() => {
    setActivity();
  }, 15e3);
});

// Start the RPC connection
rpc.login({ clientId }).catch(console.error);
// -------------------------

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});