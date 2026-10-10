import type { VideoPlayerStore } from "@videojs/core/dom";
import * as GQL from "src/core/generated-graphql";
import { PatchContainerComponent } from "src/patch";

// Places in the player that plugins can add to with PluginApi.patch, each given the scene and the player store.
export interface IPlayerSlotProps {
  scene: GQL.SceneDataFragment;
  player: VideoPlayerStore;
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
