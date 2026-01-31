"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    onGlobalEvent: function (callback) {
        var subscription = function (_, data) { return callback(data); };
        electron_1.ipcRenderer.on('global-event', subscription);
        return function () {
            electron_1.ipcRenderer.removeListener('global-event', subscription);
        };
    }
});
