const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path'); 

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: "Transmissão P2P Kaneki",
        backgroundColor: '#121212', 
        icon: path.join(__dirname, 'icon.ico'), // Ícone atualizado aqui!
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            callback({ video: sources[0], audio: 'loopback' });
        }).catch(err => console.error('Erro ao capturar tela: ', err));
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('login-discord', (event, clientId) => {
    const authWindow = new BrowserWindow({ width: 500, height: 750, show: false, webPreferences: { nodeIntegration: false } });
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=token&redirect_uri=http://localhost&scope=identify`;
    
    authWindow.loadURL(authUrl);
    authWindow.show();

    const checkUrl = async (url) => {
        if (url.includes('http://localhost')) {
            const urlObj = new URL(url.replace('#', '?'));
            const token = urlObj.searchParams.get('access_token');
            
            if (token) {
                if (!authWindow.isDestroyed()) authWindow.close();
                try {
                    const response = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
                    const userData = await response.json();
                    event.reply('login-success', userData);
                } catch (err) { console.error("Erro ao puxar dados do Discord:", err); }
            }
        }
    };

    authWindow.webContents.on('will-navigate', (e, url) => checkUrl(url));
    authWindow.webContents.on('will-redirect', (e, url) => checkUrl(url));
    authWindow.webContents.on('did-navigate', (e, url) => checkUrl(url));
});