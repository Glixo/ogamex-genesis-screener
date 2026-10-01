const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');

require('dotenv').config({
  path: path.join(__dirname, '.env'),
});

const electronConfig = require('./electron-config.cjs');

let serverProcess;
let logFile;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;

  try {
    if (logFile) {
      fs.appendFileSync(logFile, line);
    }
  } catch (_) {}

  console.log(message);
}

function waitForServer(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - start >= timeout) {
          reject(
            new Error('Le serveur local ne démarre pas.')
          );
        } else {
          setTimeout(check, 300);
        }
      });

      req.setTimeout(1000, () => req.destroy());
    }

    check();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#020817',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(
    'http://127.0.0.1:3000/?electron=1'
  );
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    log(
      'Updater ignoré : application non packagée.'
    );
    return;
  }

  log(
    `Version actuellement installée : ${app.getVersion()}`
  );

  log(
    'Démarrage de la vérification des mises à jour.'
  );

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on(
    'checking-for-update',
    () => {
      log('Recherche d’une mise à jour...');
    }
  );

  autoUpdater.on(
    'update-available',
    (info) => {
      log(
        `Mise à jour disponible : ${info.version}`
      );
    }
  );

  autoUpdater.on(
    'update-not-available',
    (info) => {
      log(
        `Aucune mise à jour disponible. Version distante : ${info.version}`
      );
    }
  );

  autoUpdater.on(
    'download-progress',
    (progress) => {
      log(
        `Téléchargement : ${Math.round(
          progress.percent
        )}%`
      );
    }
  );

  autoUpdater.on(
    'update-downloaded',
    async (info) => {
      log(
        `Mise à jour ${info.version} téléchargée.`
      );

      const result =
        await dialog.showMessageBox({
          type: 'info',
          title: 'Mise à jour disponible',
          message:
            'Une nouvelle version de OGameX Genesis Screener est prête.',
          detail:
            "L'application va redémarrer pour installer automatiquement la mise à jour.",
          buttons: [
            'Installer maintenant',
            'Plus tard',
          ],
          defaultId: 0,
          cancelId: 1,
        });

      if (result.response === 0) {
        log(
          'Installation de la mise à jour demandée.'
        );

        autoUpdater.quitAndInstall();
      } else {
        log(
          'Installation reportée par utilisateur.'
        );
      }
    }
  );

  autoUpdater.on(
    'error',
    (error) => {
      log(
        `ERREUR UPDATER : ${
          error?.stack ||
          error?.message ||
          String(error)
        }`
      );
    }
  );

  autoUpdater
    .checkForUpdates()
    .then((result) => {
      log(
        `Vérification terminée. Résultat : ${
          result?.updateInfo?.version ||
          'inconnu'
        }`
      );
    })
    .catch((error) => {
      log(
        `ERREUR checkForUpdates : ${
          error?.stack ||
          error?.message ||
          String(error)
        }`
      );
    });
}

app.whenReady().then(async () => {
  logFile = path.join(
    app.getPath('userData'),
    'updater-log.txt'
  );

  log('====================================');
  log('Démarrage OGameX Genesis Screener');
  log(`Version : ${app.getVersion()}`);
  log(`Packagée : ${app.isPackaged}`);

  /*
   * DIAGNOSTIC
   * On affiche uniquement true / false.
   * Aucune valeur secrète n'est affichée.
   */
  log(
    `ENV Electron - TOKEN: ${Boolean(
      process.env.OGAMEX_SYNC_TOKEN
    )}`
  );

  log(
    `ENV Electron - URL: ${Boolean(
      process.env.EXTERNAL_SUPABASE_URL
    )}`
  );

  log(
    `ENV Electron - SECRET: ${Boolean(
      process.env.EXTERNAL_SUPABASE_SECRET_KEY
    )}`
  );

  const serverPath = app.isPackaged
    ? path.join(
        process.resourcesPath,
        '.output',
        'server',
        'index.mjs'
      )
    : path.join(
        __dirname,
        '.output',
        'server',
        'index.mjs'
      );

  const serverEnv = {
    ...process.env,

    ELECTRON_RUN_AS_NODE: '1',
    PORT: '3000',
    HOST: '127.0.0.1',

    EXTERNAL_SUPABASE_URL:
      process.env.EXTERNAL_SUPABASE_URL ||
      electronConfig.EXTERNAL_SUPABASE_URL,

    EXTERNAL_SUPABASE_PUBLISHABLE_KEY:
      electronConfig.EXTERNAL_SUPABASE_PUBLISHABLE_KEY,

    OGAMEX_SYNC_TOKEN:
      process.env.OGAMEX_SYNC_TOKEN,

    EXTERNAL_SUPABASE_SECRET_KEY:
      process.env.EXTERNAL_SUPABASE_SECRET_KEY,
  };

  /*
   * Deuxième diagnostic :
   * ce sont exactement les variables qui vont être
   * transmises au serveur Nitro.
   */
  log(
    `ENV Serveur - TOKEN: ${Boolean(
      serverEnv.OGAMEX_SYNC_TOKEN
    )}`
  );

  log(
    `ENV Serveur - URL: ${Boolean(
      serverEnv.EXTERNAL_SUPABASE_URL
    )}`
  );

  log(
    `ENV Serveur - SECRET: ${Boolean(
      serverEnv.EXTERNAL_SUPABASE_SECRET_KEY
    )}`
  );

  serverProcess = spawn(
    process.execPath,
    [serverPath],
    {
      cwd: app.isPackaged
        ? process.resourcesPath
        : __dirname,

      env: serverEnv,

      /*
       * TEMPORAIRE POUR LE DIAGNOSTIC.
       * Cela permet de voir les erreurs du serveur
       * directement dans le CMD.
       */
      stdio: 'inherit',

      windowsHide: true,
    }
  );

  serverProcess.on(
    'error',
    (error) => {
      log(
        `ERREUR PROCESSUS SERVEUR : ${
          error?.stack ||
          error?.message ||
          String(error)
        }`
      );
    }
  );

  serverProcess.on(
    'exit',
    (code, signal) => {
      log(
        `Serveur arrêté - code=${code} signal=${signal}`
      );
    }
  );

  try {
    await waitForServer(
      'http://127.0.0.1:3000'
    );

    log('Serveur local démarré.');

    createWindow();

    setTimeout(() => {
      setupAutoUpdater();
    }, 5000);
  } catch (error) {
    log(
      `ERREUR SERVEUR : ${
        error?.stack || error
      }`
    );

    app.quit();
  }
});

app.on(
  'window-all-closed',
  () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }

    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
);