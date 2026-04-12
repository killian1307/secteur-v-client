const { app, BrowserWindow, session, ipcMain } = require('electron'); // Added ipcMain
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
      contextIsolation: true,
      // BRIDGE
      preload: path.join(__dirname, 'preload.js') 
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