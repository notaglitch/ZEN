const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    sendMessage: (message) => ipcRenderer.invoke('send-message', message),
    sendVoice: (audioBlob) => ipcRenderer.invoke('send-voice', audioBlob)
}) 