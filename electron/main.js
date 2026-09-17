const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Gestor Muvail',
    icon: path.join(__dirname, '../public/branding/muvail-icon-512.png'),
    autoHideMenuBar: true,
    show: false, // Mostrar cuando esté listo para evitar destello blanco
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  const targetUrl = process.env.APP_URL || 'https://gestor.muvail.com';

  mainWindow.loadURL(targetUrl);

  // Mostrar la ventana suavemente al cargar el primer contenido
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Manejar links externos para que abran en el navegador predeterminado
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const isInternal =
        parsed.hostname.includes('muvail.com') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1';

      if (!isInternal) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {
      // Si falla el parseo, permitir por defecto
    }
    return { action: 'allow' };
  });

  // Si no hay conexión de internet al arrancar, dar opción de reintentar
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -106 || errorCode === -105) { // ERR_INTERNET_DISCONNECTED / ERR_NAME_NOT_RESOLVED
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Sin conexión - Gestor Muvail</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: %230f172a; color: %23f8fafc; text-align: center; }
            .card { max-width: 400px; padding: 32px; border-radius: 16px; background: %231e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { font-size: 20px; margin-bottom: 8px; }
            p { font-size: 14px; color: %2394a3b8; line-height: 1.5; margin-bottom: 24px; }
            button { background: %233b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s; }
            button:hover { background: %232563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Sin conexión al servidor</h1>
            <p>No se pudo conectar con Gestor Muvail. Verificá tu conexión a internet e intentá nuevamente.</p>
            <button onclick="window.location.href='${targetUrl}'">Reintentar conexión</button>
          </div>
        </body>
        </html>
      `);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Limitar a una sola instancia de la app (si ya está abierta, traerla al frente)
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
