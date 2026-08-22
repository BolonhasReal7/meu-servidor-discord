const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const path = require('path');

// Define o ID do app para o Windows reconhecer e fixar o ícone corretamente
app.setAppUserModelId('com.kanekipro.app');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    // Puxando o seu ícone corrigido
    icon: path.join(__dirname, 'icon.ico'), 
    
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Carrega o arquivo HTML principal
  mainWindow.loadFile('index.html');
  
  // Oculta a barra de menu superior
  mainWindow.setMenuBarVisibility(false); 
}

app.whenReady().then(() => {
  createWindow();

  // --- 1. APROVA PERMISSÕES DE CÂMERA E TELA ---
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const permissoesLiberadas = ['media', 'display-capture'];
    if (permissoesLiberadas.includes(permission)) {
      callback(true); // Aprova o acesso
    } else {
      callback(false); // Bloqueia acessos não necessários
    }
  });

  // --- 2. ESCOLHE A TELA PARA COMPARTILHAR ---
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // Pega a primeira tela principal do PC automaticamente
      const telaPrincipal = sources.find(source => source.id.startsWith('screen')) || sources[0];
      
      // Envia o vídeo da tela selecionada de volta para o app
      callback({ video: telaPrincipal, audio: 'loopback' });
    }).catch(err => {
      console.error('Erro ao capturar a tela:', err);
      callback();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- LÓGICA REAL DE LOGIN DO DISCORD ---
ipcMain.on('login-discord', async (event, clientId) => {
  
  // Cria a janela pop-up para o usuário fazer login no Discord
  const authWindow = new BrowserWindow({
      width: 500, height: 750, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // URL de Autorização oficial do Discord
  const redirectUri = 'http://localhost/discord-callback';
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=identify`;

  authWindow.loadURL(authUrl);
  authWindow.show();

  // Função única para interceptar o link com o token
  const captureDiscordToken = async (navEvent, newUrl) => {
      if (newUrl.includes(redirectUri)) {
          navEvent.preventDefault(); 
          
          const hashIndex = newUrl.indexOf('#');
          if (hashIndex === -1) return;
          
          const urlParams = new URLSearchParams(newUrl.slice(hashIndex + 1));
          const accessToken = urlParams.get('access_token');

          if (accessToken) {
              try {
                  const res = await fetch('https://discord.com/api/users/@me', {
                      headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  const userData = await res.json();
                  
                  // Envia os dados verdadeiros de volta para o seu app
                  mainWindow.webContents.send('login-success', userData);
                  authWindow.close();
              } catch (err) {
                  console.error('Erro ao buscar dados do Discord:', err);
                  authWindow.close();
              }
          }
      }
  };

  // Escuta os dois tipos de navegação para garantir que o login não trave
  authWindow.webContents.on('will-redirect', captureDiscordToken);
  authWindow.webContents.on('will-navigate', captureDiscordToken);
});