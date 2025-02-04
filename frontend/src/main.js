const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const os = require('os')
const { v4: uuidv4 } = require('uuid')

let mainWindow = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            permissions: ['microphone']
        },
        backgroundColor: '#1a1a1a',
        show: false
    })

    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone']
        if (allowedPermissions.includes(permission)) {
            callback(true)
        } else {
            callback(false)
        }
    })

    mainWindow.loadFile(path.join(__dirname, 'index.html'))
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })
}

async function checkServer() {
    try {
        const response = await axios.get('http://localhost:5000/health')
        return response.data.status === 'healthy'
    } catch (error) {
        return false
    }
}

app.whenReady().then(async () => {
    try {
        const isServerReady = await checkServer()
        if (!isServerReady) {
            throw new Error('Python server is not running')
        }
        
        createWindow()

        // Handle text messages
        ipcMain.handle('send-message', async (event, message) => {
            try {
                const response = await axios.post('http://localhost:5000/chat', {
                    message: message
                })
                return response.data
            } catch (error) {
                console.error('Error sending message:', error)
                return { error: error.message || 'Failed to get response' }
            }
        })

        // Handle voice messages
        ipcMain.handle('send-voice', async (event, audioData) => {
            try {
                // Create a temporary file
                const tempFile = path.join(os.tmpdir(), `${uuidv4()}.webm`)
                fs.writeFileSync(tempFile, Buffer.from(audioData))

                const formData = new FormData()
                formData.append('audio', fs.createReadStream(tempFile))

                const response = await axios.post('http://localhost:5000/voice-chat', 
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders()
                        },
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    }
                )

                // Clean up temp file
                fs.unlinkSync(tempFile)

                return response.data
            } catch (error) {
                console.error('Error sending voice:', error)
                return { error: error.message || 'Failed to process voice' }
            }
        })
    } catch (error) {
        console.error('Startup error:', error)
        app.quit()
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
}) 