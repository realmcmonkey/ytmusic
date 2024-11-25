import { app, dialog, ipcMain, Menu, MenuItemConstructorOptions, powerMonitor, safeStorage, screen, Tray } from "electron";
import log from "electron-log";
import { getIconPath, v1ConfigMigration } from "./util";
import { AppView } from "./services/windowmanager/appview";
import { YTMViewSetupCompletionFlags, YTMViewSetupCompletionFlagsNames, YTMViewStatus } from "~shared/types";
import CompanionServer from "./integrations/companion-server";
import CustomCSS from "./integrations/custom-css";
import DiscordPresence from "./integrations/discord-presence";
import LastFM from "./integrations/last-fm";
import NowPlayingNotifications from "./integrations/notifications";
import VolumeRatio from "./integrations/volume-ratio";
import path from "node:path";
import electronSquirrelStartup from "electron-squirrel-startup";
import { ServiceHost } from "./services/servicehost";
import WatchDog from "./services/watchdog";
import AutoUpdater from "./services/autoupdater";
import ConfigStore from "./services/configstore";
import IntegrationManager, { IntegrationManagerHook } from "./services/integrationmanager";
import YTMViewManager from "./services/ytmviewmanager";
import ShortcutManager from "./services/shortcutmanager";
import TaskbarManager from "./services/taskbarmanager";
import AppWindowManager from "./services/windowmanager";
import { ServiceCollection } from "./services/servicecollection";
import StateManager from "./services/statemanager";
import MemoryStore from "./services/memorystore";
import { MemoryStoreSchema } from "~shared/store/schema";

declare const ALL_WINDOWS_VITE_DEV_SERVER_URL: string;

// Squirrel shortcut creation/removal
// This is part of application installation/uninstallation process close the app immediately
if (electronSquirrelStartup) {
  app.exit();
}

const serviceCollection = new ServiceCollection();
serviceCollection.addServices([
  WatchDog,
  ConfigStore,
  AppWindowManager,
  MemoryStore<MemoryStoreSchema>,
  AutoUpdater,
  StateManager,
  YTMViewManager,
  ShortcutManager,
  TaskbarManager,
  // This will always go last as it depends on every service since it's an optional system and integrations can perform work with any service
  IntegrationManager
]);
const serviceHost = new ServiceHost(serviceCollection);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
} else {
  app.on("second-instance", (_, commandLine) => {
    // If the service host isn't initialized the app is still starting up
    if (!serviceHost.initialized) return;

    const windowManager = serviceHost.getService(AppWindowManager);
    if (windowManager.hasWindow("Main")) {
      const mainWindow = windowManager.getWindow("Main");
      mainWindow.showAndFocus();
    }

    handleProtocol(commandLine[commandLine.length - 1]);
  });
}

log.info("Application launched");

//#region Protocol Handler
async function handleProtocol(url: string) {
  // If the service host isn't initialized the app is still starting up
  if (!serviceHost.initialized) return;

  const ytmViewManager = serviceHost.getService(YTMViewManager);

  log.info("Handling protocol url", url);
  const urlPaths = url.split("://")[1];
  if (urlPaths) {
    const paths = urlPaths.split("/");
    if (paths.length > 0) {
      switch (paths[0]) {
        case "play": {
          if (paths.length >= 2) {
            const videoId = paths[1];
            const playlistId = paths[2];

            if (ytmViewManager.isInitialized()) {
              log.debug(`Navigating to videoId: ${videoId}, playlistId: ${playlistId}`);
              await ytmViewManager.ready();
              ytmViewManager.getView().webContents.send("remoteControl:execute", "navigate", {
                watchEndpoint: {
                  videoId: videoId,
                  playlistId: playlistId
                }
              });
            }
          }
        }
      }
    }
  }
}

// This will register the protocol in development, this is intentional and should stay this way for development purposes
if (!app.isDefaultProtocolClient("ytmd")) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      log.info("Application set as default protcol client for 'ytmd'");
      app.setAsDefaultProtocolClient("ytmd", process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    log.info("Application set as default protcol client for 'ytmd'");
    app.setAsDefaultProtocolClient("ytmd", process.execPath);
  }
}
//#endregion

// Application prerequisites before fully starting
app.enableSandbox();

// appMenu allows for some basic windows management, editMenu allow for copy and paste shortcuts on MacOS
const template: MenuItemConstructorOptions[] = [{ role: "appMenu", label: "YouTube Music Desktop App" }, { role: "editMenu" }];
const builtMenu = process.platform === "darwin" ? Menu.buildFromTemplate(template) : null; // null for performance https://www.electronjs.org/docs/latest/tutorial/performance#8-call-menusetapplicationmenunull-when-you-do-not-need-a-default-menu
Menu.setApplicationMenu(builtMenu);

// At this stage the next lifecycle is PreInitialized
serviceHost.runNextLifecycle();
const integrationManager = serviceHost.getService(IntegrationManager);
integrationManager.on("enable-error", (integration, error) => {
  const dialogMessage = `The '${integration.name}' integration failed to be enabled and will be unavailable.\n\n` + `${error.stack}`;
  dialog.showMessageBox({
    title: "Integration Error",
    message: "An integration could not be enabled",
    detail: dialogMessage,
    type: "warning",
    buttons: ["Okay"]
  });
});
integrationManager.createIntegrations([CompanionServer, DiscordPresence, LastFM, NowPlayingNotifications, VolumeRatio, CustomCSS]);
integrationManager.runHook(IntegrationManagerHook.AppBeforeReady);

let tray;
let trayContextMenu;
app.on("ready", async () => {
  log.info("Application ready");

  // At this stage the next lifecycle is Initialized
  serviceHost.runNextLifecycle();

  const configStore = serviceHost.getService(ConfigStore);
  const memoryStore = serviceHost.getService(MemoryStore<MemoryStoreSchema>);
  const autoUpdater = serviceHost.getService(AutoUpdater);
  const windowManager = serviceHost.getService(AppWindowManager);
  const ytmViewManager = serviceHost.getService(YTMViewManager);
  const stateManager = serviceHost.getService(StateManager);

  //#region Updater Check
  const updaterWindow = windowManager.createWindow("Browser", {
    name: "Updater",
    autoRecreate: false,
    waitForViews: true,
    url: ALL_WINDOWS_VITE_DEV_SERVER_URL ? ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/updater/index.html" : undefined,
    file: ALL_WINDOWS_VITE_DEV_SERVER_URL ? undefined : path.join(__dirname, `../renderer/windows/updater/index.html`),
    electronOptions: {
      width: 256,
      height: 320,
      minWidth: 256,
      minHeight: 320,
      resizable: false,
      frame: false,
      show: false,
      icon: getIconPath("ytmd.png"),
      titleBarStyle: "hidden",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, `../renderer/windows/updater/preload.js`),
        devTools: !app.isPackaged ? true : configStore.get("developer.enableDevTools")
      }
    }
  });
  const autoUpdaterCallbacks = {
    checking: () => updaterWindow.webContents.send("autoUpdater:checking"),
    available: () => updaterWindow.webContents.send("autoUpdater:available"),
    notAvailable: () => updaterWindow.webContents.send("autoUpdater:not-available"),
    downloaded: () => updaterWindow.webContents.send("autoUpdater:downloaded"),
    error: () => updaterWindow.webContents.send("autoUpdater:error")
  };
  autoUpdater.once("checking", autoUpdaterCallbacks.checking);
  autoUpdater.once("available", autoUpdaterCallbacks.available);
  autoUpdater.once("not-available", autoUpdaterCallbacks.notAvailable);
  autoUpdater.once("downloaded", autoUpdaterCallbacks.downloaded);
  autoUpdater.once("error", autoUpdaterCallbacks.error);
  if (await autoUpdater.checkForUpdates(true)) {
    app.relaunch();
    app.exit();
  } else {
    await new Promise(resolve => {
      setTimeout(resolve, 1500);
    });
  }
  // Ensure the events are unbinded as we don't need them anymore
  autoUpdater.off("checking", autoUpdaterCallbacks.checking);
  autoUpdater.off("available", autoUpdaterCallbacks.available);
  autoUpdater.off("not-available", autoUpdaterCallbacks.notAvailable);
  autoUpdater.off("downloaded", autoUpdaterCallbacks.downloaded);
  autoUpdater.off("error", autoUpdaterCallbacks.error);
  //#endregion

  // At this stage the next lifecycle is PostInitialized
  serviceHost.runNextLifecycle();

  v1ConfigMigration();

  //#region safeStorage setup and checks
  if (!safeStorage.isEncryptionAvailable()) {
    memoryStore.set("safeStorageAvailable", false);
  } else {
    memoryStore.set("safeStorageAvailable", true);
  }

  ipcMain.handle("safeStorage:decryptString", (event, value: string) => {
    if (!memoryStore.get("safeStorageAvailable")) throw new Error("safeStorage is unavailable");

    if (value) {
      return safeStorage.decryptString(Buffer.from(value, "hex"));
    } else {
      return null;
    }
  });

  ipcMain.handle("safeStorage:encryptString", (event, value: string) => {
    if (!memoryStore.get("safeStorageAvailable")) throw new Error("safeStorage is unavailable");

    return safeStorage.encryptString(value).toString("hex");
  });
  //#endregion

  //#region App IPC
  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  ipcMain.on("app:relaunch", () => {
    app.relaunch();
    app.quit();
  });
  //#endregion

  //#region Main Window
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  const windowBounds = configStore.get("state.windowBounds");

  const mainView = new AppView({
    name: "Main",
    url: ALL_WINDOWS_VITE_DEV_SERVER_URL ? ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/main/index.html" : undefined,
    file: ALL_WINDOWS_VITE_DEV_SERVER_URL ? undefined : path.join(__dirname, `../renderer/windows/main/index.html`),
    autoRecreate: true,
    viewState: {
      autoResize: {
        width: true,
        height: true,
        offsetHeight: {
          anchor: "Bottom",
          pixels: 36
        }
      }
    },
    electronOptions: {
      webPreferences: {
        transparent: true,
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, `../renderer/windows/main/preload.js`),
        devTools: !app.isPackaged ? true : configStore.get("developer.enableDevTools")
      }
    }
  });

  const mainWindow = windowManager.createWindow("Browser", {
    name: "Main",
    autoRecreate: false,
    waitForViews: true,
    windowState: {
      maximized: configStore.get("state.windowMaximized")
    },
    views: [mainView],
    url: ALL_WINDOWS_VITE_DEV_SERVER_URL ? ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/titlebar/index.html" : undefined,
    file: ALL_WINDOWS_VITE_DEV_SERVER_URL ? undefined : path.join(__dirname, `../renderer/windows/titlebar/index.html`),
    electronOptions: {
      width: windowBounds?.width ?? 1280 / scaleFactor,
      height: windowBounds?.height ?? 720 / scaleFactor,
      x: windowBounds?.x,
      y: windowBounds?.y,
      minWidth: 156,
      minHeight: 180,
      frame: false,
      show: false,
      icon: getIconPath("ytmd.png"),
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#000000",
        symbolColor: "#BBBBBB",
        height: 36
      },
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, `../renderer/windows/titlebar/preload.js`),
        devTools: !app.isPackaged ? true : configStore.get("developer.enableDevTools"),
        additionalArguments: ["is-main-window"]
      }
    }
  });

  mainWindow.on("electronwindow-resize", () => {
    stateManager.updateState({
      windowBounds: mainWindow._getElectronWindow().getBounds()
    });
  });
  mainWindow.on("electronwindow-move", () => {
    stateManager.updateState({
      windowBounds: mainWindow._getElectronWindow().getBounds()
    });
  });
  mainWindow.on("electronwindow-maximize", () => {
    stateManager.updateState({
      windowMaximized: true
    });
  });
  mainWindow.on("electronwindow-unmaximize", () => {
    stateManager.updateState({
      windowMaximized: false
    });
  });
  // This event is not called if the app is quitting
  // Do not put critical clean up code here
  mainWindow.on("electronwindow-close", event => {
    if (configStore.get("general.hideToTrayOnClose")) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.ipcOn("window:openSettings", () => {
    if (windowManager.hasWindow("Settings")) {
      windowManager.getWindow("Settings").showAndFocus();
      return;
    }

    const mainWindowBounds = mainWindow._getElectronWindow().getBounds();
    windowManager.createWindow("Browser", {
      name: "Settings",
      autoRecreate: false,
      waitForViews: true,
      url: ALL_WINDOWS_VITE_DEV_SERVER_URL ? ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/settings/index.html" : undefined,
      file: ALL_WINDOWS_VITE_DEV_SERVER_URL ? undefined : path.join(__dirname, `../renderer/windows/settings/index.html`),
      electronOptions: {
        width: 800,
        height: 600,
        x: Math.round(mainWindowBounds.x + (mainWindowBounds.width / 2 - 400)),
        y: Math.round(mainWindowBounds.y + (mainWindowBounds.height / 2 - 300)),
        minimizable: false,
        maximizable: false,
        resizable: false,
        frame: false,
        show: false,
        icon: getIconPath("ytmd.png"),
        parent: mainWindow._getElectronWindow(),
        modal: process.platform !== "darwin",
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#000000",
          symbolColor: "#BBBBBB",
          height: 36
        },
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          preload: path.join(__dirname, `../renderer/windows/settings/preload.js`),
          devTools: !app.isPackaged ? true : configStore.get("developer.enableDevTools")
        }
      }
    });
  });
  mainWindow.ipcOn("ytmView:navigateDefault", () => {
    const ytmView = ytmViewManager.getView();
    if (ytmView) ytmView.webContents.loadURL("https://music.youtube.com/");
  });
  //#endregion

  // Late updater window closure to prevent Electron from emitting window-all-closed before creating the main window
  updaterWindow.destroyWindow();

  //#region Tray creation
  tray = new Tray(
    path.join(
      !app.isPackaged ? path.join(app.getAppPath(), "src/assets/icons") : process.resourcesPath,
      process.platform === "win32" ? "tray.ico" : "trayTemplate.png"
    )
  );
  trayContextMenu = Menu.buildFromTemplate([
    {
      label: "YouTube Music Desktop",
      type: "normal",
      enabled: false
    },
    {
      type: "separator"
    },
    {
      label: "Show/Hide Window",
      type: "normal",
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.showAndFocus();
        }
      }
    },
    {
      label: "Play/Pause",
      type: "normal",
      click: async () => {
        await ytmViewManager.ready();
        ytmViewManager.getView().webContents.send("remoteControl:execute", "playPause");
      }
    },
    {
      label: "Previous",
      type: "normal",
      click: async () => {
        await ytmViewManager.ready();
        ytmViewManager.getView().webContents.send("remoteControl:execute", "previous");
      }
    },
    {
      label: "Next",
      type: "normal",
      click: async () => {
        await ytmViewManager.ready();
        ytmViewManager.getView().webContents.send("remoteControl:execute", "next");
      }
    },
    {
      type: "separator"
    },
    {
      label: "Quit",
      type: "normal",
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setToolTip("YouTube Music Desktop");
  tray.setContextMenu(trayContextMenu);
  tray.on("click", () => {
    mainWindow.showAndFocus();
  });

  log.info("Created tray icon");
  //#endregion

  // Wait for the main window to be ready
  await mainWindow.ready();

  // Attach events for the ytmviewmanager
  ytmViewManager.on("status-changed", async () => {
    mainView.webContents.send("ytmView:statusChanged", ytmViewManager.status);
    if (ytmViewManager.status === YTMViewStatus.Ready) {
      await mainView.hide(true);
      if (ytmViewManager.hasError()) {
        const hookError = ytmViewManager.getError();
        const setupFlags = ytmViewManager.getSetupFlags();
        const setFlags = YTMViewSetupCompletionFlagsNames.filter(key => (setupFlags & YTMViewSetupCompletionFlags[key]) !== 0);
        const unsetFlags = YTMViewSetupCompletionFlagsNames.filter(key => (setupFlags & YTMViewSetupCompletionFlags[key]) === 0);

        const dialogMessage =
          `Features from YouTube Music Desktop App may not be present or function correctly\n\nHook log:\n${setFlags.map(flag => `    ${flag}... OK\n`).join("")}${unsetFlags.map(flag => `    ${flag}... FAIL\n`).join("")}\n` +
          `${hookError.stack}`;
        dialog.showMessageBox({
          title: "Hook Error",
          message: "YouTube Music Desktop App could not hook YouTube Music",
          detail: dialogMessage,
          type: "warning",
          buttons: ["I understand"]
        });
      }
    } else {
      await mainView.show(true);
    }
  });
  ytmViewManager.on("view-recreated", async () => {
    await mainView.show(true);
  });
  ytmViewManager.on("unresponsive", async () => {
    await mainView.show(true);
  });
  ytmViewManager.on("responsive", async () => {
    await mainView.hide(true);
  });

  // Initially create the YTM view and attach it
  ytmViewManager.createView();
  mainWindow.attachView(ytmViewManager.getView(), 0);

  // This hides the main view if it was recreated and the YTMView is in a ready state
  await mainView.on("recreated", async () => {
    await ytmViewManager.ready();
    await mainView.hide(true);
  });

  integrationManager.runHook(IntegrationManagerHook.AppReady);
});

app.on("open-url", (_, url) => {
  handleProtocol(url);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- powerMonitor doesn't have proper types?
powerMonitor.on("shutdown", (event: any) => {
  event.preventDefault();
  const stateManager = serviceHost.getService(StateManager);
  stateManager.forceWrite();
  app.quit();
});
app.on("before-quit", () => {
  log.debug("Application going to quit");

  const windowManager = serviceHost.getService(AppWindowManager);
  windowManager.forceWindowClosures();
});
app.on("quit", () => {
  log.debug("Application quit");

  // At this stage the next lifecycle is Terminated
  serviceHost.runNextLifecycle();
});
