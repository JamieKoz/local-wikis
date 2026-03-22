/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const appUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
  win.loadURL(appUrl);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory", "multiSelections"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const folders = new Set();
  for (const selectedPath of result.filePaths) {
    try {
      const stat = fs.statSync(selectedPath);
      if (stat.isDirectory()) {
        folders.add(path.resolve(selectedPath));
      } else {
        folders.add(path.dirname(path.resolve(selectedPath)));
      }
    } catch {
      // Ignore paths we cannot stat.
    }
  }

  return Array.from(folders);
});

if (!isDev) {
  process.env.NODE_ENV = "production";
}
