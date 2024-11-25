import { globalShortcut } from "electron";
import log from "electron-log";
import Service from "../service";
import ConfigStore from "../configstore";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import YTMViewManager from "../ytmviewmanager";
import { DependencyConstructor } from "~shared/types";
import MemoryStore from "../memorystore";

export default class ShortcutManager extends Service {
  public static override readonly dependencies: DependencyConstructor<Service>[] = [ConfigStore, YTMViewManager, MemoryStore<MemoryStoreSchema>];

  private _initialized = false;
  public get initialized() {
    return this._initialized;
  }

  public override onPreInitialized(): void {}
  public onInitialized() {
    if (this._initialized) throw new Error("ShortcutManager is already initialized!");
    this._initialized = true;

    log.info("ShortcutManager initialized");
  }
  public override onPostInitialized(): void {
    const configStore = this.getDependency(ConfigStore);
    configStore.onDidChange("shortcuts", shortcuts => {
      this.reconcileShortcuts(shortcuts);
    });

    this.reconcileShortcuts();
  }
  public override onTerminated(): void {}

  public reconcileShortcuts(state?: StoreSchema["shortcuts"]) {
    let shortcuts = state;
    if (!state) {
      const configStore = this.getDependency(ConfigStore);
      shortcuts = configStore.get("shortcuts");
    }

    globalShortcut.unregisterAll();
    log.info("Unregistered shortcuts");

    const ytmViewManager = this.getDependency(YTMViewManager);
    const memoryStore = this.getDependency(MemoryStore<MemoryStoreSchema>);

    if (shortcuts.playPause) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.playPause, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "playPause");
        });
      } catch {
        /* ignored */
      }

      if (!registered) {
        log.info("Failed to register shortcut: playPause");
        memoryStore.set("shortcutsPlayPauseRegisterFailed", true);
      } else {
        log.info("Registered shortcut: playPause");
        memoryStore.set("shortcutsPlayPauseRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsPlayPauseRegisterFailed", false);
    }

    if (shortcuts.next) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.next, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "next");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: next");
        memoryStore.set("shortcutsNextRegisterFailed", true);
      } else {
        log.info("Registered shortcut: next");
        memoryStore.set("shortcutsNextRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsNextRegisterFailed", false);
    }

    if (shortcuts.previous) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.previous, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "previous");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: previous");
        memoryStore.set("shortcutsPreviousRegisterFailed", true);
      } else {
        log.info("Registered shortcut: previous");
        memoryStore.set("shortcutsPreviousRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsPreviousRegisterFailed", false);
    }

    if (shortcuts.thumbsUp) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.thumbsUp, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "toggleLike");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: thumbsUp");
        memoryStore.set("shortcutsThumbsUpRegisterFailed", true);
      } else {
        log.info("Registered shortcut: thumbsUp");
        memoryStore.set("shortcutsThumbsUpRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsThumbsUpRegisterFailed", false);
    }

    if (shortcuts.thumbsDown) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.thumbsDown, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "toggleDislike");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: thumbsDown");
        memoryStore.set("shortcutsThumbsDownRegisterFailed", true);
      } else {
        log.info("Registered shortcut: thumbsDown");
        memoryStore.set("shortcutsThumbsDownRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsThumbsDownRegisterFailed", false);
    }

    if (shortcuts.volumeUp) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.volumeUp, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "volumeUp");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: volumeUp");
        memoryStore.set("shortcutsVolumeUpRegisterFailed", true);
      } else {
        log.info("Registered shortcut: volumeUp");
        memoryStore.set("shortcutsVolumeUpRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsVolumeUpRegisterFailed", false);
    }

    if (shortcuts.volumeDown) {
      let registered = false;
      try {
        registered = globalShortcut.register(shortcuts.volumeDown, async () => {
          await ytmViewManager.ready();
          ytmViewManager.getView().webContents.send("remoteControl:execute", "volumeDown");
        });
      } catch {
        /* empty */
      }

      if (!registered) {
        log.info("Failed to register shortcut: volumeDown");
        memoryStore.set("shortcutsVolumeDownRegisterFailed", true);
      } else {
        log.info("Registered shortcut: volumeDown");
        memoryStore.set("shortcutsVolumeDownRegisterFailed", false);
      }
    } else {
      memoryStore.set("shortcutsVolumeDownRegisterFailed", false);
    }

    log.info("Registered shortcuts");
  }
}
