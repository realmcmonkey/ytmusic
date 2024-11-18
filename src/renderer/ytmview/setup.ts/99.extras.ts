import { webFrame } from "electron";
import playerBarControlsScript from "../scripts/playerbarcontrols.script?raw";

export function overrideHistoryButtonDisplay() {
  // @ts-expect-error Style is reported as readonly but this still works
  document.querySelector<HTMLElement>("#history-link tp-yt-paper-icon-button").style = "display: inline-block !important;";
}

export async function hideChromecastButton() {
  (
    await webFrame.executeJavaScript(`
      (function() {
        window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_CAST_AVAILABLE', payload: false });
      })
    `)
  )();
}

export async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}
