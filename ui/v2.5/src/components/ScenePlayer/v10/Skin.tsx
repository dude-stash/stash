import React from "react";
import { Container, Hotkey } from "@videojs/react";
import "./skin/styles/video/compat.css";
import "./skin/video/skin.css";
import { VideoGestures } from "./skin/video/behaviors/gestures";
import { VideoControls } from "./skin/video/controls";
import { ErrorDialog } from "./skin/video/shared/error-dialog";
import { Indicators } from "./skin/video/shared/indicators";
import { SeekIndicator } from "./skin/video/shared/seek-indicator";
import { StatusAnnouncer } from "./skin/video/shared/status-announcer";
import { Title } from "./skin/video/shared/title";
import { BufferingIndicator, Poster } from "./skin/video/shared/video-feedback";

const Hotkeys: React.FC = () => (
  <>
    <Hotkey keys="Space" action="togglePaused" />
    <Hotkey keys="m" action="toggleMuted" />
    <Hotkey keys="ArrowRight" action="seekStep" />
    <Hotkey keys="ArrowLeft" action="seekStep" />
    <Hotkey keys="ArrowUp" action="volumeStep" />
    <Hotkey keys="ArrowDown" action="volumeStep" />
    <Hotkey keys="0-9" action="seekToPercent" />
    <Hotkey keys="Home" action="seekToPercent" value={0} />
    <Hotkey keys="End" action="seekToPercent" value={100} />
    <Hotkey keys="f" action="toggleFullscreen" />
  </>
);

interface ISkinProps {
  media: React.ReactNode;
  children?: React.ReactNode;
}

// The copied skin's VideoSkin, with only the keyboard shortcuts the v7 player also has, since the others clash with the scene page's.
export const Skin = React.forwardRef<HTMLDivElement, ISkinProps>(
  ({ media, children }, ref) => (
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
      <VideoControls />
      <Hotkeys />
      <VideoGestures />
      <StatusAnnouncer />
      <Indicators>
        <SeekIndicator />
      </Indicators>
      {children}
    </Container>
  )
);
