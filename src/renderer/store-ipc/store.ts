import { ipcRenderer } from "electron";

if (process.type !== "renderer") {
  throw new Error("This module can only be used from the renderer process");
}

export default class Store<TSchema> {
  public set(key: string, value?: unknown) {
    return ipcRenderer.send("configStore:set", key, value);
  }

  public async get(key: keyof TSchema) {
    return await ipcRenderer.invoke("configStore:get", key);
  }

  public reset(key: keyof TSchema) {
    return ipcRenderer.send("configStore:reset", key);
  }

  public onDidAnyChange(callback: (newState: TSchema, oldState: TSchema) => void) {
    return ipcRenderer.on("configStore:stateChanged", (event, newState, oldState) => {
      callback(newState, oldState);
    });
  }
}
