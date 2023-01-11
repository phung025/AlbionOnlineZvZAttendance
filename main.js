const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("path");

ipcMain.handle('show-error', (event, ...args) => {
  const notification = {
    title: 'Error',
    body: `${args[0]}`
  }

  new Notification(notification).show()
});

ipcMain.handle('show-player-detail', (event, ...args) => {
  const newWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });
  newWindow.loadFile(path.join(__dirname, "player.html")).then(() => {
    newWindow.webContents.send('store-data', args[0]);
  }).then(() => {
    newWindow.show();
  });
});

const loadMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });
  mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.on("ready", loadMainWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    loadMainWindow();
  }
});
