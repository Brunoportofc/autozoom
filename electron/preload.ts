import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    onGlobalEvent: (callback: (event: any) => void) => {
        const subscription = (_: any, data: any) => callback(data);
        ipcRenderer.on('global-event', subscription);
        return () => {
            ipcRenderer.removeListener('global-event', subscription);
        }
    },
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources')
});
