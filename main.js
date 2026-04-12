const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Secteur V - Client",
    icon: path.join(__dirname, 'assets/v.webp'),
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});