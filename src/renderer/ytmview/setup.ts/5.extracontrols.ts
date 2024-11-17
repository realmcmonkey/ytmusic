import { webFrame } from "electron";
import playerBarControlsScript from "../scripts/playerbarcontrols.script?raw";

export async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}
