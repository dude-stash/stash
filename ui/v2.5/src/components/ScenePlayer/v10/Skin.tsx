import React from "react";
import {
  BufferingIndicator as BufferingState,
  Container,
  Controls,
  Gesture,
  Hotkey,
  Time,
  Tooltip,
} from "@videojs/react";
import "./skin/styles/video/compat.css";
import "./skin/video/skin.css";
import { CaptionsToggle } from "./skin/video/shared/captions-button";
import { ErrorDialog } from "./skin/video/shared/error-dialog";
import { Indicators } from "./skin/video/shared/indicators";
import { PlayButton } from "./skin/video/shared/play-button";
import { ScreenControls } from "./skin/video/shared/screen-controls";
import { SeekButton } from "./skin/video/shared/seek-button";
import { SeekIndicator } from "./skin/video/shared/seek-indicator";
import { SettingsMenu } from "./skin/video/shared/settings-menu";
import { StatusAnnouncer } from "./skin/video/shared/status-announcer";
import { TimeSlider } from "./skin/video/shared/time-slider";
import { Title } from "./skin/video/shared/title";
import { BufferingIndicator, Poster } from "./skin/video/shared/video-feedback";
import { VolumePopover } from "./skin/video/shared/volume-popover";

interface IControlsSlots {
  controlsBeforePlay?: React.ReactNode;
  controlsAfterPlay?: React.ReactNode;
}

const CenterSeekButton: React.FC<{ seconds: number }> = ({ seconds }) => (
  <SeekButton
    className="video-controls-center-button video-controls-center-seek"
    iconClassName="video-controls-center-seek-icon"
    seconds={seconds}
    tooltip={false}
  />
);

// The copied skin's video controls, with places for Stash's controls either side of the play button.
const VideoControls: React.FC<IControlsSlots> = ({
  controlsBeforePlay,
  controlsAfterPlay,
}) => (
  <Controls.Root>
    <BufferingState className="video-controls-buffering">
      <Controls.Backdrop className="video-controls-backdrop" />
      <Controls.Content className="video-controls-content">
        <Tooltip.Provider>
          <Controls.Group className="video-controls-top">
            <ScreenControls />
          </Controls.Group>
          <Controls.Group className="video-controls-center">
            <CenterSeekButton seconds={-10} />
            <PlayButton
              className="video-controls-center-button video-controls-center-play"
              iconClassName="video-controls-center-play-icon"
              tooltip={false}
            />
            <CenterSeekButton seconds={10} />
          </Controls.Group>
          <div className="video-controls-bottom video-controls-video-bottom">
            <TimeSlider />
            <Controls.Group className="video-controls-row">
              <Controls.Group className="video-controls-group video-controls-start">
                {controlsBeforePlay}
                <PlayButton />
                {controlsAfterPlay}
                <VolumePopover />
                <Time.Group className="media-time-group">
                  <Time.Value
                    className="media-time-toggle"
                    type="current"
                    toggle
                  />
                  <Time.Value
                    className="media-time-current-value"
                    type="current"
                  />
                  <Time.Separator className="media-time-separator" />
                  <Time.Value
                    className="media-time-duration-value"
                    type="duration"
                  />
                </Time.Group>
              </Controls.Group>
              <Controls.Group className="video-controls-group">
                <CaptionsToggle />
                <SettingsMenu />
              </Controls.Group>
            </Controls.Group>
          </div>
        </Tooltip.Provider>
      </Controls.Content>
    </BufferingState>
  </Controls.Root>
);

// The v7 player's shortcuts; the rest are handled by the player.
const Hotkeys: React.FC = () => (
  <>
    <Hotkey keys="Space" action="togglePaused" />
    <Hotkey keys="Enter" action="togglePaused" />
    <Hotkey keys="m" action="toggleMuted" />
    <Hotkey keys="ArrowRight" action="seekStep" value={10} />
    <Hotkey keys="ArrowLeft" action="seekStep" value={-10} />
    <Hotkey keys="Shift+ArrowRight" action="seekStep" value={5} />
    <Hotkey keys="Shift+ArrowLeft" action="seekStep" value={-5} />
    <Hotkey keys="Ctrl+ArrowRight" action="seekStep" value={60} />
    <Hotkey keys="Ctrl+ArrowLeft" action="seekStep" value={-60} />
    <Hotkey keys="Alt+ArrowRight" action="seekStep" value={60} />
    <Hotkey keys="Alt+ArrowLeft" action="seekStep" value={-60} />
    <Hotkey keys="ArrowUp" action="volumeStep" value={0.1} />
    <Hotkey keys="ArrowDown" action="volumeStep" value={-0.1} />
    <Hotkey keys="0-9" action="seekToPercent" />
    <Hotkey keys="Home" action="seekToPercent" value={0} />
    <Hotkey keys="End" action="seekToPercent" value={100} />
    <Hotkey keys="f" action="toggleFullscreen" />
  </>
);

// As in v7, a click anywhere plays or pauses and a double-click toggles fullscreen; touch keeps the skin's gestures.
const Gestures: React.FC = () => (
  <>
    <Gesture type="tap" action="togglePaused" pointer="mouse" />
    <Gesture type="doubletap" action="toggleFullscreen" pointer="mouse" />
    <Gesture type="tap" action="toggleControls" pointer="touch" />
    <Gesture type="doubletap" action="seekStep" region="left" pointer="touch" />
    <Gesture
      type="doubletap"
      action="toggleFullscreen"
      region="center"
      pointer="touch"
    />
    <Gesture
      type="doubletap"
      action="seekStep"
      region="right"
      pointer="touch"
    />
  </>
);

interface ISkinProps extends IControlsSlots {
  media: React.ReactNode;
  children?: React.ReactNode;
}

// The copied skin's VideoSkin, with Stash's controls, shortcuts and gestures.
export const Skin = React.forwardRef<HTMLDivElement, ISkinProps>(
  ({ media, children, ...slots }, ref) => (
    <Container
      ref={ref}
      className="media-skin media-container media-video"
      data-theme="compat"
      data-preset="video"
    >
      {media}
      <Poster />
      <BufferingIndicator />
      <ErrorDialog />
      <Title />
      <VideoControls {...slots} />
      <Hotkeys />
      <Gestures />
      <StatusAnnouncer />
      <Indicators>
        <SeekIndicator />
      </Indicators>
      {children}
    </Container>
  )
);
