const { app, BrowserWindow, session, ipcMain } = require('electron'); // Added ipcMain
const path = require('path');
const DiscordRPC = require('discord-rpc');
const windowStateKeeper = require('electron-window-state');

const clientId = '1469011238552862764'; 
DiscordRPC.register(clientId);

let mainWindow;

function createWindow () {
  // Load the previous state with fallbacks
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,           // Let the state keeper set X
    y: mainWindowState.y,           // Let the state keeper set Y
    width: mainWindowState.width,   // Let the state keeper set Width
    height: mainWindowState.height, // Let the state keeper set Height
    minWidth: 900,
    minHeight: 600,
    title: "Secteur V - Client",
    icon: path.join(__dirname, 'build/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      // When loading live URLs, nodeIntegration must be false so malicious scripts can't access the user's computer.
      nodeIntegration: false,
      contextIsolation: true,
      // BRIDGE
      preload: path.join(__dirname, 'preload.js') 
    }
  });

  mainWindowState.manage(mainWindow);

  // Define the filter
  const filter = {
    urls: ['*://localhost/*']
  };

  // Intercept outgoing requests and append custom tag to the User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    // Grab the default Chrome User-Agent and just add the tag to the end
    details.requestHeaders['User-Agent'] = session.defaultSession.getUserAgent() + ' SecteurV-Desktop-App';
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Load the URL normally
  mainWindow.loadURL('http://localhost/');
}

// --- IPC LISTENER & DISCORD RPC SETUP ---
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
const startTimestamp = new Date();

// CREATE A VARIABLE TO HOLD THE USER'S DATA
let currentUserData = null;

// LISTEN FOR DATA FROM THE WEBSITE
ipcMain.on('update-rpc', (event, data) => {
  console.log("Received data from website:", data);
  currentUserData = data; // Save the name and elo
  setActivity();          // Instantly update Discord
});

ipcMain.on('toggle-auto-start', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe') // Ensures it points to the installed executable
  });
  console.log(`Auto-start set to: ${enable}`);
});

ipcMain.handle('get-auto-start-status', () => {
  // Returns true or false based on the user's OS settings
  return app.getLoginItemSettings().openAtLogin;
});

async function setActivity() {
  if (!rpc) return;

  // DYNAMICALLY GENERATE THE HOVER TEXT
  let hoverText = 'Not logged in';
  if (currentUserData) {
    hoverText = `${currentUserData.username} - ${currentUserData.elo} EDP`;
  }

  try {
    await rpc.setActivity({
      details: 'On the dashboard',
      state: 'Managing Brackets',
      startTimestamp,
      largeImageKey: 'pfp',             
      largeImageText: 'Secteur V',      
      smallImageKey: 'secteurv',        
      smallImageText: hoverText,        // USE THE DYNAMIC TEXT HERE
      instance: false,                  
      buttons: [{ label: 'Check it out!', url: 'https://secteur-v.letterk.me' }]
    });
  } catch (error) {
    console.error('❌ Payload rejected:', error);
  }
}

rpc.on('ready', () => {
  console.log(`✅ Discord RPC Connected!`);
  setActivity();
  setInterval(() => { setActivity(); }, 15000);
});

// --- DISCORD RPC RECONNECT LOGIC ---
function connectDiscordRPC() {
  rpc.login({ clientId }).catch((err) => {
    console.error('RPC Login Failed, retrying in 10s...', err.message);
    setTimeout(connectDiscordRPC, 10000); // Try again in 10 seconds
  });
}

// If Discord is closed/refreshed while the app is running
rpc.on('disconnected', () => {
  console.log('❌ Discord closed or refreshed. Attempting to reconnect...');
  setTimeout(connectDiscordRPC, 10000);
});

// Initial connection attempt
connectDiscordRPC();
// -------------------------

const { autoUpdater } = require('electron-updater');

app.whenReady().then(() => {
  createWindow();
  
  // Check for updates silently in the background
  autoUpdater.checkForUpdatesAndNotify();
});

// Optional: Log update status so you can see it working
autoUpdater.on('update-available', () => {
  console.log('Update found! Downloading...');
});
autoUpdater.on('update-downloaded', () => {
  console.log('Update downloaded! It will install on restart.');
});