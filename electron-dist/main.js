"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var path_1 = require("path");
var electron_is_dev_1 = require("electron-is-dev");
var uiohook_napi_1 = require("uiohook-napi");
var mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    var url = electron_is_dev_1.default
        ? 'http://localhost:3000'
        : "file://".concat(path_1.default.join(__dirname, '../out/index.html'));
    mainWindow.loadURL(url);
    if (electron_is_dev_1.default) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(function () {
    createWindow();
    // Setup Global Hook via uIOhook
    // Note: uIOhook needs to be started
    uiohook_napi_1.uIOhook.start();
    // Specific Listeners
    uiohook_napi_1.uIOhook.on('mousemove', function (e) {
        // Send to renderer for recording (if recording is active - logic can be refined)
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousemove', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('mousedown', function (e) {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousedown', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('mouseup', function (e) {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mouseup', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('keydown', function (e) {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'keydown', eventData: e, timestamp: Date.now() });
        }
    });
});
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
