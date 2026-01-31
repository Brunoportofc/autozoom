"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const electron_is_dev_1 = __importDefault(require("electron-is-dev"));
const uiohook_napi_1 = require("uiohook-napi");
let mainWindow = null;
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
    const url = electron_is_dev_1.default
        ? 'http://localhost:3000'
        : `file://${path_1.default.join(__dirname, '../out/index.html')}`;
    mainWindow.loadURL(url);
    if (electron_is_dev_1.default) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    // Setup Global Hook via uIOhook
    uiohook_napi_1.uIOhook.start();
    // Handle Screen Sources Request
    electron_1.ipcMain.handle('get-desktop-sources', () => __awaiter(void 0, void 0, void 0, function* () {
        const sources = yield electron_1.desktopCapturer.getSources({ types: ['window', 'screen'] });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    }));
    // Specific Listeners
    uiohook_napi_1.uIOhook.on('mousemove', (e) => {
        // Send to renderer for recording (if recording is active - logic can be refined)
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousemove', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('mousedown', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousedown', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('mouseup', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mouseup', eventData: e, timestamp: Date.now() });
        }
    });
    uiohook_napi_1.uIOhook.on('keydown', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'keydown', eventData: e, timestamp: Date.now() });
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
