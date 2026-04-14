const { app, BrowserWindow, session, ipcMain, dialog, Tray, Menu, globalShortcut, desktopCapturer, Notification, shell, nativeImage, screen } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const DiscordRPC = require('discord-rpc');
const windowStateKeeper = require('electron-window-state');


if (app.isPackaged) {
  app.setAppUserModelId('com.secteurv.client');
} else {
  app.setAppUserModelId(process.execPath);
}

const iconPath = path.join(__dirname, 'build', 'icon.ico');
const iconPathTray = path.join(__dirname, 'assets', 'icon.ico');
const soundPath = path.join(__dirname, 'assets', 'screenshot.wav').replace(/\\/g, '/');

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
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Apply defaults for existing users who don't have these new settings yet
    if (typeof config.overlayEnabled === 'undefined') config.overlayEnabled = true;
    if (typeof config.overlayVolume === 'undefined') config.overlayVolume = 0.5;
    if (typeof config.overlayMuted === 'undefined') config.overlayMuted = false;
    return config;
  }
  return { startMinimized: false, overlayEnabled: true, overlayVolume: 0.5, overlayMuted: false };
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
}

// --- IPC: OVERLAY SETTINGS ---
ipcMain.handle('get-overlay-settings', () => {
  const config = getConfig();
  return {
    overlayEnabled: config.overlayEnabled,
    overlayVolume: config.overlayVolume,
    overlayMuted: config.overlayMuted
  };
});

ipcMain.on('toggle-overlay', (event, value) => {
  const config = getConfig();
  config.overlayEnabled = value;
  saveConfig(config);
  // If user disables it while it's currently open, force close it immediately!
  if (!value && overlayWindow) {
    overlayWindow.close();
  }
});

ipcMain.on('set-overlay-volume', (event, value) => {
  const config = getConfig();
  config.overlayVolume = parseFloat(value);
  saveConfig(config);
});

ipcMain.on('toggle-overlay-mute', (event, value) => {
  const config = getConfig();
  config.overlayMuted = value;
  saveConfig(config);
});

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
    show: false, // Start hidden until ready
    title: "Secteur V - Client",
    icon: iconPath,
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

  mainWindow.once('ready-to-show', () => {
    if (config.startMinimized) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  // Devs
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
  tray = new Tray(iconPathTray);
  
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
        body: 'Screenshot saved to Pictures/Secteur V'
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
    icon: iconPath,
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

  startTargetingGame();
  
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

// ==========================================
// --- IN-GAME OVERLAY SYSTEM ---
// ==========================================
let overlayWindow = null;
let isOverlayInteractive = false;
let gameCheckInterval = null;

// The exact name of the Victory Road executable in Task Manager.
const GAME_EXECUTABLE_NAME = "nie.exe"; 

function createOverlayWindow() {
  if (overlayWindow) return;

  // Create the transparent ghost window
  overlayWindow = new BrowserWindow({
    transparent: true,      // Makes the window see-through
    frame: false,           
    alwaysOnTop: true,      // Forces it over the game
    skipTaskbar: true,      // Hides it from the taskbar
    fullscreen: true,       // Covers the whole monitor
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // By default, clicks pass through the overlay to the game below
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load PHP file
  const isDev = !app.isPackaged;
  const overlayURL = isDev ? 'http://localhost' : 'https://secteur-v.letterk.me';
  overlayWindow.loadURL(`${overlayURL}/overlay.php`);

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive(); 
  });

  // Catch the login signal from the dashboard
  ipcMain.on('user-logged-in', () => {
    console.log("Main window logged in! Telling overlay to update...");
    
    // If the overlay is currently open and hovering over a game, tell it to refresh
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('update-overlay-data');
    }
  });

  // Register the interaction hotkey (Shift + Tab)
  globalShortcut.register('Shift+Tab', () => {
    isOverlayInteractive = !isOverlayInteractive;
    
    if (isOverlayInteractive) {
      // OVERLAY MODE ON
      overlayWindow.setIgnoreMouseEvents(false);
      overlayWindow.focus(); // Steal keyboard focus so they can type in chat
    } else {
      // GAME MODE ON
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.blur(); // Drop focus so the game takes the keyboard back
    }

    // Tell the UI to dim/undim
    overlayWindow.webContents.send('overlay-mode-toggled', isOverlayInteractive);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    globalShortcut.unregister('Shift+Tab');
  });
}

// Function to silently check Windows Task Manager every 5 seconds
function startTargetingGame() {
  gameCheckInterval = setInterval(() => {
    
    // Check if the user disabled the overlay in settings
    const config = getConfig();
    if (!config.overlayEnabled) {
      if (overlayWindow) overlayWindow.close(); // Safety kill
      return; // Skip checking the task manager entirely
    }

    // Is Victory Road
    exec(`tasklist /FI "IMAGENAME eq ${GAME_EXECUTABLE_NAME}"`, (err, stdout) => {
      
      const isRunning = stdout.toLowerCase().includes(GAME_EXECUTABLE_NAME.toLowerCase());
      
      if (isRunning && !overlayWindow) {
        console.log("Victory Road detected! Launching overlay...");
        createOverlayWindow();
      } else if (!isRunning && overlayWindow) {
        console.log("Victory Road closed. Destroying overlay...");
        overlayWindow.close();
      }
    });
  }, 5000); // Check every 5 seconds
}

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