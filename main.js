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
    urls: ['*://secteur-v.letterk.me/*']
  };

  // Intercept outgoing requests and append custom tag to the User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    // Grab the default Chrome User-Agent and just add the tag to the end
    details.requestHeaders['User-Agent'] = session.defaultSession.getUserAgent() + ' SecteurV-Desktop-App';
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Load the URL normally
  mainWindow.loadURL('https://secteur-v.letterk.me/');
}

// ==========================================
// --- IPC LISTENER & DISCORD RPC SETUP ---
// ==========================================

const startTimestamp = new Date();

let rpc = null;
let currentRPCData = null;  // Holds the exact text sent by PHP

// Catch dynamic updates from PHP
ipcMain.on('update-rpc', (event, data) => {
  // console.log("📥 Received new RPC data from website:", data);
  currentRPCData = data; 
  setActivity(); // Try to push immediately
});

// Activity Setter
async function setActivity() {
  if (!rpc || !currentRPCData) return; // Don't run if disconnected or no data

  try {
    await rpc.setActivity({
      details: currentRPCData.details,
      state: currentRPCData.state,
      startTimestamp,
      largeImageKey: 'pfp',             
      largeImageText: 'Secteur V',      
      smallImageKey: 'secteurv',        
      smallImageText: currentRPCData.hover, 
      instance: false,                  
      buttons: [{ label: 'Secteur V', url: 'https://secteur-v.letterk.me' }]
    });
    // console.log("✅ Activity pushed to Discord!");
  } catch (error) {
    // console.log('⏳ RPC Update rate-limited by Discord, waiting for next loop...'); 
  }
}

// The Reconnection Engine
function setupDiscordRPC() {
  // NUKE the old corrupted connection if it exists
  if (rpc) {
    try { rpc.destroy(); } catch (e) {}
    rpc = null;
  }

  // SPAWN a brand new client
  rpc = new DiscordRPC.Client({ transport: 'ipc' });

  rpc.on('ready', () => {
    // console.log('🎮 Discord RPC Connected and Ready!');
    setActivity();
    
    // Clear old intervals and start a fresh 15-second loop
    if (global.rpcInterval) clearInterval(global.rpcInterval);
    global.rpcInterval = setInterval(() => {
      setActivity();
    }, 15000);
  });

  rpc.on('disconnected', () => {
    // console.log('❌ Discord closed/refreshed. Rebuilding connection in 10s...');
    if (global.rpcInterval) clearInterval(global.rpcInterval);
    setTimeout(setupDiscordRPC, 10000);
  });

  rpc.login({ clientId }).catch((err) => {
    // console.log('⚠️ RPC Login failed. Retrying in 10s...');
    setTimeout(setupDiscordRPC, 10000);
  });
}

// Start the engine
setupDiscordRPC();


// ==========================================
// --- OS SETTINGS & AUTO-UPDATER ---
// ==========================================

ipcMain.on('toggle-auto-start', (event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe') 
  });
  // console.log(`Auto-start set to: ${enable}`);
});

ipcMain.handle('get-auto-start-status', () => {
  return app.getLoginItemSettings().openAtLogin;
});

const { autoUpdater } = require('electron-updater');

let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false, // Removes the Windows top bar
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true }
  });
  splashWindow.loadFile('splash.html');

  splashWindow.webContents.on('did-finish-load', () => {
    const version = app.getVersion();
    splashWindow.webContents.executeJavaScript(`document.getElementById('version').innerText = 'v${version}';`);
  });
}

// Helper to safely update the text on the splash screen
function updateSplashText(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`document.getElementById('status').innerText = '${text}';`);
  }
}

app.whenReady().then(() => {
  createSplashWindow();
  
  setTimeout(() => {
    // Check if running via 'npm start' or via built '.exe'
    if (!app.isPackaged) {
      // Dev Mode
      updateSplashText('Dev Mode: Skipping updates...');
      
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
        createWindow(); // Open the main app
      }, 1500);
      
    } else {
      // Production Mode. Check GitHub for updates
      autoUpdater.checkForUpdatesAndNotify();
    }
  }, 1000);
});

// Auto-Updater Events
autoUpdater.on('checking-for-update', () => {
  updateSplashText('Checking the servers...');
});

autoUpdater.on('update-available', () => {
  updateSplashText('Update found! Preparing download...');
});

// IF NO UPDATE: Close splash and open the main app
autoUpdater.on('update-not-available', () => {
  updateSplashText('Client is up to date! Loading...');
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    createWindow(); // Opens the main app
  }, 1000);
});

// Show download progress percentage
autoUpdater.on('download-progress', (progressObj) => {
  let percent = Math.round(progressObj.percent);
  updateSplashText(`Downloading update... ${percent}%`);
});

// Install the update once downloaded
autoUpdater.on('update-downloaded', () => {
  updateSplashText('Download complete! Restarting...');
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 2000);
});

// Catch errors
autoUpdater.on('error', (err) => {
  updateSplashText('Update server unreachable. Loading app...');
  console.log('Updater Error: ', err); // Logs the actual error
  
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    createWindow(); // Let them into the app even if the update check fails
  }, 2000);
});