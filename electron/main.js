import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

// ESM directory fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Log suppression in production
if (app.isPackaged) {
    Object.assign(console, {
        log: () => { },
        info: () => { },
        debug: () => { }
    });
}

let mainWindow = null;
let scraperProcess = null;

const isDev = !app.isPackaged;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'), // Even if empty, good practice
        },
        autoHideMenuBar: true,
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startScraper() {
    let scriptPath;
    // In both Dev and Prod (ASAR), scraper.mjs is one level up from electron/main.js
    scriptPath = path.join(__dirname, '../scraper.mjs');

    console.log(`Starting scraper from: ${scriptPath}`);

    // In production, we might need to invoke node executable if not bundled
    // But Electron app doesn't bundle node executable for sidecars easily without extra config.
    // A simpler way for this task: assume 'node' is available or bundle scraper as a binary.
    // For this "Step 1" of packaging: Just use fork.

    try {
        scraperProcess = fork(scriptPath, [], {
            stdio: 'inherit',
            env: { ...process.env, PORT: '3000' } // Ensure PORT is set
        });

        scraperProcess.on('message', (msg) => {
            console.log('Scraper message:', msg);
        });

        scraperProcess.on('error', (err) => {
            console.error('Scraper failed:', err);
        });

        scraperProcess.on('exit', (code) => {
            console.log(`Scraper exited with code ${code}`);
        });

    } catch (e) {
        console.error("Failed to fork scraper:", e);
    }
}

app.whenReady().then(() => {
    startScraper();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (scraperProcess) {
        console.log('Killing scraper process...');
        scraperProcess.kill();
        scraperProcess = null;
    }
});
