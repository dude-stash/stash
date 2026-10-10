import React from "react";
import "./skin/video/skin";

// React 17 can only fill a template's content through innerHTML.
const Template: React.FC<{ html: string }> = ({ html }) => (
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static markup from the copied skin
  <template dangerouslySetInnerHTML={{ __html: html }} />
);

// The Compat skin's markup from ./skin/video/skin.html, as JSX, with places for Stash's controls.
interface ISkinProps {
  containerRef?: React.Ref<HTMLElement>;
  remotePlayback?: boolean;
  starting?: boolean;
  media: React.ReactNode;
  controlsBeforePlay?: React.ReactNode;
  controlsAfterPlay?: React.ReactNode;
  controlsEnd?: React.ReactNode;
  settingsStart?: React.ReactNode;
  settingsSpeed?: React.ReactNode;
  settingsEnd?: React.ReactNode;
  sliderLayer?: React.ReactNode;
  sliderPreviewTitle?: string;
}

export const Skin: React.FC<ISkinProps> = ({
  containerRef,
  remotePlayback,
  starting,
  media,
  controlsBeforePlay,
  controlsAfterPlay,
  controlsEnd,
  settingsStart,
  settingsSpeed,
  settingsEnd,
  sliderLayer,
  sliderPreviewTitle,
  children,
}) => (
  <media-container
    ref={containerRef}
    data-stash-starting={starting ? "" : undefined}
    class="media-skin media-container media-video"
    data-theme="compat"
    data-preset="video"
  >
    {media}
    <media-poster class="media-poster">
      <img alt="" decoding="async" className="media-poster-image" />
    </media-poster>
    <media-buffering-indicator class="media-buffering-indicator">
      <media-icon
        family="compat"
        name="spinner"
        class="media-buffering-indicator-spinner-icon"
      />
    </media-buffering-indicator>
    <media-error-dialog>
      <media-dialog-backdrop class="media-dialog-backdrop" />
      <media-dialog-popup class="media-dialog-popup">
        <media-dialog-title class="media-dialog-title" />
        <media-dialog-description class="media-dialog-description" />
        <media-dialog-close class="media-button media-dialog-close" />
      </media-dialog-popup>
    </media-error-dialog>
    <media-title class="media-title" />
    <media-controls>
      <media-buffering-indicator class="video-controls-buffering">
        <media-controls-backdrop class="video-controls-backdrop" />
        <media-controls-content class="video-controls-content">
          <media-tooltip-group>
            <media-controls-group class="video-controls-top">
              {remotePlayback && (
                <>
                  <media-airplay-button
                    class="media-button media-airplay-button"
                    id="vjs-SSYvGroJ-0-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="airplay-enter"
                      class="media-button-icon media-airplay-button-enter-icon"
                    />
                    <media-icon
                      family="compat"
                      name="airplay-exit"
                      class="media-button-icon media-airplay-button-exit-icon"
                    />
                  </media-airplay-button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-trigger"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup media-tooltip-screen-popup"
                  >
                    <media-tooltip-label />
                    <media-tooltip-shortcut class="media-tooltip-shortcut" />
                  </media-tooltip>
                  <media-cast-button
                    class="media-button media-cast-button"
                    id="vjs-SSYvGroJ-0-2-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="cast-enter"
                      class="media-button-icon media-cast-button-enter-icon"
                    />
                    <media-icon
                      family="compat"
                      name="cast-exit"
                      class="media-button-icon media-cast-button-exit-icon"
                    />
                  </media-cast-button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-2-trigger"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup media-tooltip-screen-popup"
                  >
                    <media-tooltip-label />
                    <media-tooltip-shortcut class="media-tooltip-shortcut" />
                  </media-tooltip>
                </>
              )}
              <media-pip-button
                class="media-button media-pip-button"
                id="vjs-SSYvGroJ-0-3-trigger"
              >
                <media-icon
                  family="compat"
                  name="pip-enter"
                  class="media-button-icon media-pip-button-enter-icon"
                />
                <media-icon
                  family="compat"
                  name="pip-exit"
                  class="media-button-icon media-pip-button-exit-icon"
                />
              </media-pip-button>
              <media-tooltip
                trigger="vjs-SSYvGroJ-0-3-trigger"
                side="top"
                class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup media-tooltip-screen-popup"
              >
                <media-tooltip-label />
                <media-tooltip-shortcut class="media-tooltip-shortcut" />
              </media-tooltip>
              <media-fullscreen-button
                class="media-button media-fullscreen-button"
                id="vjs-SSYvGroJ-0-4-trigger"
              >
                <media-icon
                  family="compat"
                  name="fullscreen-enter"
                  class="media-button-icon media-fullscreen-button-enter-icon"
                />
                <media-icon
                  family="compat"
                  name="fullscreen-exit"
                  class="media-button-icon media-fullscreen-button-exit-icon"
                />
              </media-fullscreen-button>
              <media-tooltip
                trigger="vjs-SSYvGroJ-0-4-trigger"
                side="top"
                class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup media-tooltip-screen-popup"
              >
                <media-tooltip-label />
                <media-tooltip-shortcut class="media-tooltip-shortcut" />
              </media-tooltip>
            </media-controls-group>
            <media-controls-group class="video-controls-center">
              <media-seek-button
                seconds="-10"
                class="media-button video-controls-center-button video-controls-center-seek"
                id="vjs-SSYvGroJ-0-5-trigger"
              >
                <div className="media-seek-button-content">
                  <media-icon
                    family="compat"
                    name="seek"
                    class="media-button-icon media-seek-button-backward-icon video-controls-center-seek-icon"
                  />
                  <span className="media-seek-button-label media-seek-button-backward-label">
                    10
                  </span>
                </div>
              </media-seek-button>
              <media-tooltip
                trigger="vjs-SSYvGroJ-0-5-trigger"
                disabled
                side="top"
                class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
              >
                <media-tooltip-label />
                <media-tooltip-shortcut class="media-tooltip-shortcut" />
              </media-tooltip>
              <media-play-button
                class="media-button media-play-button video-controls-center-button video-controls-center-play"
                id="vjs-SSYvGroJ-0-6-trigger"
              >
                <media-icon
                  family="compat"
                  name="restart"
                  class="media-button-icon-base media-play-button-restart-icon video-controls-center-play-icon"
                />
                <media-icon
                  family="compat"
                  name="play"
                  class="media-button-icon-base media-play-button-play-icon video-controls-center-play-icon"
                />
                <media-icon
                  family="compat"
                  name="pause"
                  class="media-button-icon-base media-play-button-pause-icon video-controls-center-play-icon"
                />
              </media-play-button>
              <media-tooltip
                trigger="vjs-SSYvGroJ-0-6-trigger"
                disabled
                side="top"
                class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
              >
                <media-tooltip-label />
                <media-tooltip-shortcut class="media-tooltip-shortcut" />
              </media-tooltip>
              <media-seek-button
                seconds="10"
                class="media-button video-controls-center-button video-controls-center-seek"
                id="vjs-SSYvGroJ-0-7-trigger"
              >
                <div className="media-seek-button-content">
                  <media-icon
                    family="compat"
                    name="seek"
                    class="media-button-icon video-controls-center-seek-icon"
                  />
                  <span className="media-seek-button-label media-seek-button-forward-label">
                    10
                  </span>
                </div>
              </media-seek-button>
              <media-tooltip
                trigger="vjs-SSYvGroJ-0-7-trigger"
                disabled
                side="top"
                class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
              >
                <media-tooltip-label />
                <media-tooltip-shortcut class="media-tooltip-shortcut" />
              </media-tooltip>
            </media-controls-group>
            <div className="video-controls-bottom video-controls-video-bottom">
              <div className="video-controls-slider-row">
                <media-time-slider
                  class="media-time-slider"
                  thumb-alignment="edge"
                >
                  <media-time-slider-chapters class="media-time-slider-chapters">
                    <Template
                      html={`<div class="media-time-slider-chapter"><media-slider-track class="media-time-slider-track"><media-slider-buffer class="media-time-slider-buffer"></media-slider-buffer><media-slider-fill class="media-time-slider-fill"></media-slider-fill></media-slider-track></div>`}
                    />
                  </media-time-slider-chapters>
                  {sliderLayer}
                  <media-slider-thumb class="media-time-slider-thumb" />
                  <media-slider-preview class="media-time-slider-preview">
                    <media-slider-thumbnail class="media-slider-thumbnail">
                      <img
                        alt=""
                        aria-hidden="true"
                        decoding="async"
                        className="media-slider-thumbnail-image"
                      />
                    </media-slider-thumbnail>
                    <div className="media-time-slider-preview-meta">
                      <div className="media-time-slider-preview-label">
                        <media-slider-value
                          class="media-time-slider-value"
                          type="pointer"
                        />
                        <media-time-slider-chapter-title class="media-time-slider-chapter-title" />
                        {sliderPreviewTitle && (
                          <span className="media-time-slider-chapter-title">
                            {sliderPreviewTitle}
                          </span>
                        )}
                      </div>
                    </div>
                  </media-slider-preview>
                </media-time-slider>
              </div>
              <media-controls-group class="video-controls-row">
                <media-controls-group class="video-controls-group video-controls-start">
                  {controlsBeforePlay}
                  <media-play-button
                    class="media-button media-play-button"
                    id="vjs-SSYvGroJ-0-8-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="restart"
                      class="media-button-icon-base media-play-button-restart-icon"
                    />
                    <media-icon
                      family="compat"
                      name="play"
                      class="media-button-icon-base media-play-button-play-icon"
                    />
                    <media-icon
                      family="compat"
                      name="pause"
                      class="media-button-icon-base media-play-button-pause-icon"
                    />
                  </media-play-button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-8-trigger"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
                  >
                    <media-tooltip-label />
                    <media-tooltip-shortcut class="media-tooltip-shortcut" />
                  </media-tooltip>
                  {controlsAfterPlay}
                  <media-mute-button
                    commandfor="vjs-VqoBpvCY-0-popup"
                    class="media-button media-mute-button"
                    id="vjs-SSYvGroJ-0-9-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="volume-off"
                      class="media-button-icon media-mute-button-off-icon"
                    />
                    <media-icon
                      family="compat"
                      name="volume-high"
                      class="media-button-icon media-mute-button-high-icon"
                    />
                  </media-mute-button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-9-trigger"
                    delay="0"
                    disabled
                    side="top"
                    sticky
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
                  >
                    <media-tooltip-label />
                    <media-tooltip-shortcut class="media-tooltip-shortcut" />
                  </media-tooltip>
                  <media-volume-popover
                    open-on-hover
                    delay="200"
                    close-delay="100"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-volume-popover-popup"
                    id="vjs-VqoBpvCY-0-popup"
                  >
                    <media-volume-slider
                      class="media-volume-slider"
                      orientation="vertical"
                      thumb-alignment="edge"
                    >
                      <media-slider-track class="media-volume-slider-track">
                        <media-slider-fill class="media-volume-slider-fill" />
                      </media-slider-track>
                      <media-slider-thumb class="media-volume-slider-thumb" />
                    </media-volume-slider>
                  </media-volume-popover>
                  <media-time-group class="media-time-group">
                    <media-time
                      class="media-time-toggle"
                      type="current"
                      toggle
                    />
                    <media-time
                      class="media-time-current-value"
                      type="current"
                    />
                    <media-time-separator class="media-time-separator" />
                    <media-time
                      class="media-time-duration-value"
                      type="duration"
                    />
                  </media-time-group>
                </media-controls-group>
                <media-controls-group class="video-controls-group">
                  {controlsEnd}
                  <media-captions-button
                    class="media-button media-captions-button"
                    id="vjs-SSYvGroJ-0-10-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="captions-off"
                      class="media-button-icon media-captions-button-off-icon"
                    />
                    <media-icon
                      family="compat"
                      name="captions-on"
                      class="media-button-icon media-captions-button-on-icon"
                    />
                  </media-captions-button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-10-trigger"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
                  >
                    <media-tooltip-label />
                    <media-tooltip-shortcut class="media-tooltip-shortcut" />
                  </media-tooltip>
                  <button
                    commandfor="vjs-WU7c3aPF-h-popup"
                    className="media-button media-settings-button"
                    id="vjs-SSYvGroJ-0-11-trigger"
                  >
                    <media-icon
                      family="compat"
                      name="gear"
                      class="media-button-icon media-settings-button-icon"
                    />
                    <media-text
                      class="media-settings-button-label"
                      token="menu.settings"
                    >
                      Settings
                    </media-text>
                  </button>
                  <media-tooltip
                    trigger="vjs-SSYvGroJ-0-11-trigger"
                    side="top"
                    class="media-popup media-popup-safe-area media-popup-transition media-tooltip-popup"
                  >
                    <media-text token="menu.settings">Settings</media-text>
                  </media-tooltip>
                  <media-menu
                    side="top"
                    align="center"
                    class="media-popup media-popup-safe-area media-menu-popup media-menu-resizable-popup"
                    id="vjs-WU7c3aPF-h-popup"
                  >
                    <media-menu-content class="media-menu-content">
                      {settingsStart}
                      <media-menu-item
                        commandfor="vjs-WU7c3aPF-1-content"
                        class="media-menu-item"
                      >
                        <media-icon
                          family="compat"
                          name="switches"
                          class="media-menu-trigger-icon"
                        />
                        <media-text token="menu.quality">Quality</media-text>
                        <span className="media-menu-hint">
                          <span
                            data-part="value"
                            className="media-menu-hint-label"
                          />
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-forward-chevron"
                          />
                        </span>
                      </media-menu-item>
                      <media-menu-content
                        class="media-menu-content"
                        id="vjs-WU7c3aPF-1-content"
                      >
                        <media-menu-item class="media-menu-back-item">
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-back-chevron"
                          />
                          <media-text token="menu.quality">Quality</media-text>
                        </media-menu-item>
                        <media-menu-separator class="media-menu-separator" />
                        <media-quality-radio-group class="media-menu-radio-group">
                          <Template
                            html={`<media-menu-radio-item class="media-menu-radio-item"><span><span data-part="label"></span><sup data-part="tier" class="media-menu-tier"></sup></span><span data-part="badge" class="media-menu-badge"></span><media-menu-item-indicator force-mount class="media-menu-indicator"><media-icon family="compat" name="check" class="media-menu-radio-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                          />
                        </media-quality-radio-group>
                      </media-menu-content>
                      <media-menu-item
                        commandfor="vjs-WU7c3aPF-5-content"
                        class="media-menu-item"
                      >
                        <media-icon
                          family="compat"
                          name="speech"
                          class="media-menu-trigger-icon"
                        />
                        <media-text token="menu.audio">Audio</media-text>
                        <span className="media-menu-hint">
                          <span
                            data-part="value"
                            className="media-menu-hint-label"
                          />
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-forward-chevron"
                          />
                        </span>
                      </media-menu-item>
                      <media-menu-content
                        class="media-menu-content"
                        id="vjs-WU7c3aPF-5-content"
                      >
                        <media-menu-item class="media-menu-back-item">
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-back-chevron"
                          />
                          <media-text token="menu.audio">Audio</media-text>
                        </media-menu-item>
                        <media-menu-separator class="media-menu-separator" />
                        <media-audio-track-radio-group class="media-menu-radio-group">
                          <Template
                            html={`<media-menu-radio-item class="media-menu-radio-item"><span data-part="label"></span><media-menu-item-indicator force-mount class="media-menu-indicator"><media-icon family="compat" name="check" class="media-menu-radio-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                          />
                        </media-audio-track-radio-group>
                      </media-menu-content>
                      {settingsSpeed}
                      <media-menu-item
                        commandfor="vjs-WU7c3aPF-d-content"
                        class="media-menu-item"
                      >
                        <media-icon
                          family="compat"
                          name="captions-off"
                          class="media-menu-trigger-icon"
                        />
                        <media-text token="menu.captions">Captions</media-text>
                        <span className="media-menu-hint">
                          <span
                            data-part="value"
                            className="media-menu-hint-label"
                          />
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-forward-chevron"
                          />
                        </span>
                      </media-menu-item>
                      <media-menu-content
                        class="media-menu-content"
                        id="vjs-WU7c3aPF-d-content"
                      >
                        <media-menu-item class="media-menu-back-item">
                          <media-icon
                            family="compat"
                            name="chevron"
                            class="media-menu-back-chevron"
                          />
                          <media-text token="menu.captions">
                            Captions
                          </media-text>
                        </media-menu-item>
                        <media-menu-separator class="media-menu-separator" />
                        <media-captions-radio-group class="media-menu-radio-group">
                          <Template
                            html={`<media-menu-radio-item class="media-menu-radio-item"><span data-part="label"></span><media-menu-item-indicator force-mount class="media-menu-indicator"><media-icon family="compat" name="check" class="media-menu-radio-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                          />
                        </media-captions-radio-group>
                      </media-menu-content>
                      {settingsEnd}
                    </media-menu-content>
                  </media-menu>
                </media-controls-group>
              </media-controls-group>
            </div>
          </media-tooltip-group>
        </media-controls-content>
      </media-buffering-indicator>
    </media-controls>
    {/* The v7 player's shortcuts; the rest are handled by the player. */}
    <media-hotkey keys="Space" action="togglePaused" />
    <media-hotkey keys="Enter" action="togglePaused" />
    <media-hotkey keys="m" action="toggleMuted" />
    <media-hotkey keys="ArrowRight" action="seekStep" value="10" />
    <media-hotkey keys="ArrowLeft" action="seekStep" value="-10" />
    <media-hotkey keys="Shift+ArrowRight" action="seekStep" value="5" />
    <media-hotkey keys="Shift+ArrowLeft" action="seekStep" value="-5" />
    <media-hotkey keys="Ctrl+ArrowRight" action="seekStep" value="60" />
    <media-hotkey keys="Ctrl+ArrowLeft" action="seekStep" value="-60" />
    <media-hotkey keys="Alt+ArrowRight" action="seekStep" value="60" />
    <media-hotkey keys="Alt+ArrowLeft" action="seekStep" value="-60" />
    <media-hotkey keys="ArrowUp" action="volumeStep" value="0.1" />
    <media-hotkey keys="ArrowDown" action="volumeStep" value="-0.1" />
    <media-hotkey keys="0-9" action="seekToPercent" />
    <media-hotkey keys="Home" action="seekToPercent" value="0" />
    <media-hotkey keys="End" action="seekToPercent" value="100" />
    <media-hotkey keys="f" action="toggleFullscreen" />
    {/* As in v7, a click anywhere plays or pauses and a double-click toggles fullscreen; touch keeps the skin's gestures. */}
    <media-gesture type="tap" action="togglePaused" pointer="mouse" />
    <media-gesture type="doubletap" action="toggleFullscreen" pointer="mouse" />
    <media-gesture type="tap" action="toggleControls" pointer="touch" />
    <media-gesture
      type="doubletap"
      action="seekStep"
      region="left"
      pointer="touch"
    />
    <media-gesture
      type="doubletap"
      action="toggleFullscreen"
      region="center"
      pointer="touch"
    />
    <media-gesture
      type="doubletap"
      action="seekStep"
      region="right"
      pointer="touch"
    />
    <media-status-announcer class="media-status-announcer" />
    <div aria-hidden="true" className="media-indicator-group">
      <media-volume-indicator class="media-indicator media-volume-indicator">
        <media-volume-indicator-fill class="media-volume-indicator-fill">
          <media-icon
            family="compat"
            name="volume-high"
            class="media-volume-indicator-icon media-volume-indicator-high-icon"
          />
          <media-icon
            family="compat"
            name="volume-low"
            class="media-volume-indicator-icon media-volume-indicator-low-icon"
          />
          <media-icon
            family="compat"
            name="volume-off"
            class="media-volume-indicator-icon media-volume-indicator-off-icon"
          />
          <media-volume-indicator-value class="media-volume-indicator-value" />
        </media-volume-indicator-fill>
      </media-volume-indicator>
      <media-status-indicator
        actions="toggleSubtitles,toggleFullscreen,togglePictureInPicture"
        class="media-indicator media-status-indicator"
      >
        <media-icon
          family="compat"
          name="captions-on"
          class="media-status-indicator-icon media-status-indicator-captions-on-icon"
        />
        <media-icon
          family="compat"
          name="captions-off"
          class="media-status-indicator-icon media-status-indicator-captions-off-icon"
        />
        <media-icon
          family="compat"
          name="fullscreen-enter"
          class="media-status-indicator-icon media-status-indicator-fullscreen-enter-icon"
        />
        <media-icon
          family="compat"
          name="fullscreen-exit"
          class="media-status-indicator-icon media-status-indicator-fullscreen-exit-icon"
        />
        <media-icon
          family="compat"
          name="pip-enter"
          class="media-status-indicator-icon media-status-indicator-pip-enter-icon"
        />
        <media-icon
          family="compat"
          name="pip-exit"
          class="media-status-indicator-icon media-status-indicator-pip-exit-icon"
        />
        <media-status-indicator-value />
      </media-status-indicator>
      <media-seek-indicator class="media-indicator media-seek-indicator">
        <media-icon
          family="compat"
          name="chevron"
          class="media-seek-indicator-icon"
        />
        <media-seek-indicator-value class="media-seek-indicator-value" />
      </media-seek-indicator>
    </div>
    {children}
  </media-container>
);
