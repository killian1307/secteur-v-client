const { app, BrowserWindow, session, ipcMain, dialog, Tray, Menu, globalShortcut, desktopCapturer, Notification, shell, nativeImage } = require('electron'); // Added ipcMain
const fs = require('fs');
const path = require('path');
const DiscordRPC = require('discord-rpc');
const windowStateKeeper = require('electron-window-state');

app.setAppUserModelId('com.secteurv.client');

const clientId = '1469011238552862764'; 
DiscordRPC.register(clientId);

let tray = null;
let isQuitting = false;

// ==========================================
// APP SETTINGS STORAGE
// ==========================================
const configPath = path.join(app.getPath('userData'), 'secteur-v-config.json');

function getConfig() {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return { startMinimized: false };
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
}

// Catch the toggles 
ipcMain.handle('get-start-minimized', () => {
  return getConfig().startMinimized;
});

ipcMain.on('toggle-start-minimized', (event, value) => {
  const config = getConfig();
  config.startMinimized = value;
  saveConfig(config);
});

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

  const config = getConfig();
  if (!config.startMinimized) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  }

  // Devs can test against localhost, but in production we only want to intercept the actual website's requests.
  const isDev = !app.isPackaged;
  const baseURL = isDev ? 'http://localhost' : 'https://secteur-v.letterk.me';

    // Define the filter
  const filter = {
    urls: [isDev ? '*://localhost/*' : '*://secteur-v.letterk.me/*']
  };

  // Intercept outgoing requests and append custom tag to the User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    // Grab the default Chrome User-Agent and just add the tag to the end
    details.requestHeaders['User-Agent'] = session.defaultSession.getUserAgent() + ' SecteurV-Desktop-App';
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Load the URL
  mainWindow.loadURL(baseURL);

// NATIVE DIALOG FOR BEFOREUNLOAD WARNINGS
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    

    const locale = app.getLocale(); 

    const dialogStrings = {
      fr: {
        buttons: ['Quitter', 'Rester'],
        title: 'Attention',
        message: 'Êtes-vous sûr de vouloir quitter ?',
        detail: 'Si vous êtes dans un match ou une file d\'attente, quitter peut entraîner une pénalité.'
      },
      en: {
        buttons: ['Leave', 'Stay'],
        title: 'Warning',
        message: 'Are you sure you want to leave?',
        detail: 'If you are in a match or queue, leaving may result in a penalty.'
      }
    };

    const lang = locale.startsWith('fr') ? dialogStrings.fr : dialogStrings.en;

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: lang.buttons,
      title: lang.title,
      message: lang.message,
      detail: lang.detail,
      defaultId: 1, 
      cancelId: 1   
    });

    if (choice === 0) {
      event.preventDefault(); 
    }
  });

  // Intercept the close button to hide to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'build/icon.ico'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Secteur V', click: () => mainWindow.show() },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Secteur V');
  tray.setContextMenu(contextMenu);

  // Double click tray icon to open
  tray.on('double-click', () => mainWindow.show());

  // left click to open context menu
  tray.on('click', () => tray.popUpContextMenu());
}

// LOCAL SCREENSHOT LOGIC
async function takeScreenshotAndSave() {
  try {
    // Grab the primary screen
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    const primaryScreen = sources[0];

    if (primaryScreen) {
      // Convert the screen to a high-quality PNG
      const pngBuffer = primaryScreen.thumbnail.toPNG();

      // Find the user's "Pictures" folder and create a "Secteur V" folder inside it
      const picturesFolder = app.getPath('pictures');
      const secteurVFolder = path.join(picturesFolder, 'Secteur V');

      if (!fs.existsSync(secteurVFolder)) {
        fs.mkdirSync(secteurVFolder);
      }

      // Create a unique filename using the current date and time
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(secteurVFolder, `Match_Screenshot_${timestamp}.png`);

      // Save the file
      fs.writeFileSync(filePath, pngBuffer);

      // Trigger a native Windows notification so they know it worked
      new Notification({
        title: 'Secteur V',
        body: 'Screenshot saved to Pictures/Secteur V',
        icon: path.join(__dirname, 'build/icon.ico')
      }).show();
    }
  } catch (err) {
    console.error("Screenshot failed:", err);
  }
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

  // REGISTER GLOBAL HOTKEYS
  const ret = globalShortcut.register('CommandOrControl+Shift+S', () => {
    console.log('Screenshot Hotkey Pressed!');
    takeScreenshotAndSave();
  });

  if (!ret) {
    console.log('Hotkey registration failed.');
  }

  createSplashWindow();
  
  setTimeout(() => {
    // Check if running via 'npm start' or via built '.exe'
    if (!app.isPackaged) {
      // Dev Mode
      updateSplashText('Dev Mode: Skipping updates...');
      
      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
        createWindow(); // Open the main app
        createTray();    // Set up the system tray
      }, 1500);
      
    } else {
      // Production Mode. Check GitHub for updates
      autoUpdater.checkForUpdatesAndNotify();
    }
  }, 1000);
});

// Unregister when quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
    createTray();    // Set up the system tray
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
    createTray();    // Set up the system tray
  }, 2000);
});