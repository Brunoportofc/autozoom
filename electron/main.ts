import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import { uIOhook, UiohookKey, UiohookWheelEvent } from 'uiohook-napi';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const url = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../out/index.html')}`;

    mainWindow.loadURL(url);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // Setup Global Hook via uIOhook
    uIOhook.start();

    // Handle Screen Sources Request
    ipcMain.handle('get-desktop-sources', async () => {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    });

    // Specific Listeners
    uIOhook.on('mousemove', (e) => {
        // Send to renderer for recording (if recording is active - logic can be refined)
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousemove', eventData: e, timestamp: Date.now() });
        }
    });

    uIOhook.on('mousedown', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mousedown', eventData: e, timestamp: Date.now() });
        }
    });

    uIOhook.on('mouseup', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'mouseup', eventData: e, timestamp: Date.now() });
        }
    });

    uIOhook.on('keydown', (e) => {
        if (mainWindow) {
            mainWindow.webContents.send('global-event', { type: 'keydown', eventData: e, timestamp: Date.now() });
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
