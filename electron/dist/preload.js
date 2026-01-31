"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    onGlobalEvent: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('global-event', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('global-event', subscription);
        };
    },
    getDesktopSources: () => electron_1.ipcRenderer.invoke('get-desktop-sources')
});
