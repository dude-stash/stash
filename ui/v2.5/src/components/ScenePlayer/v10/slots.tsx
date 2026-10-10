import * as GQL from "src/core/generated-graphql";
import { PatchContainerComponent } from "src/patch";
import { PlayerElement } from "./store";

// Places in the player that plugins can add to with PluginApi.patch, each given the scene and the player element.
export interface IPlayerSlotProps {
  scene: GQL.SceneDataFragment;
  player: PlayerElement | null;
}

export const ControlBarSlot = PatchContainerComponent<IPlayerSlotProps>(
  "ScenePlayer.ControlBar"
);
export const SettingsMenuSlot = PatchContainerComponent<IPlayerSlotProps>(
  "ScenePlayer.SettingsMenu"
);
export const SeekBarSlot = PatchContainerComponent<IPlayerSlotProps>(
  "ScenePlayer.SeekBar"
);
export const OverlaySlot = PatchContainerComponent<IPlayerSlotProps>(
  "ScenePlayer.Overlay"
);
