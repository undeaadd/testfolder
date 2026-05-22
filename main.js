const { app, BrowserWindow } = require('electron');
const path = require('path');

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    // Определяем, откуда загружать интерфейс: из dev-сервера или из собранной папки dist
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        // Загружаем с dev-сервера Vite (порт обычно 3000 или 5173)
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools();
    } else {
        // Загружаем собранный файл из папки dist
        win.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }
};

app.whenReady().then(() => {
    createWindow();
});