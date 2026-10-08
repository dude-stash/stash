import React from "react";
import "./skin/video/skin";

// React 17 can only fill a template's content through innerHTML.
const Template: React.FC<{ html: string }> = ({ html }) => (
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static markup from the vendored skin
  <template dangerouslySetInnerHTML={{ __html: html }} />
);

// Converted from the Video.js 10.0.1 default video skin (shadcn.videojs.org/r/html/video.json), with slots for Stash's controls.
interface ISkinProps {
  containerRef?: React.Ref<HTMLElement>;
  starting?: boolean;
  media: React.ReactNode;
  controlsStart?: React.ReactNode;
  controlsAfterPlay?: React.ReactNode;
  controlsEnd?: React.ReactNode;
  controlsSecondary?: React.ReactNode;
  settingsItems?: React.ReactNode;
  sliderLayer?: React.ReactNode;
}

export const Skin: React.FC<ISkinProps> = ({
  containerRef,
  starting,
  media,
  controlsStart,
  controlsAfterPlay,
  controlsEnd,
  controlsSecondary,
  settingsItems,
  sliderLayer,
  children,
}) => (
  <media-container
    ref={containerRef}
    data-stash-starting={starting ? "" : undefined}
    class="media-skin media-container video-skin"
    data-theme="default"
    data-preset="video"
  >
    {media}
    <media-poster class="media-poster">
      <img alt="" decoding="async" className="media-poster-image" />
    </media-poster>
    <media-buffering-indicator class="media-buffering-indicator">
      <media-icon
        name="spinner"
        class="media-buffering-indicator-spinner-icon"
      />
    </media-buffering-indicator>
    <media-error-dialog class="media-dialog-root">
      <media-dialog-backdrop class="media-dialog-backdrop" />
      <media-dialog-popup class="media-dialog-popup">
        <div className="media-dialog-content">
          <media-dialog-title class="media-dialog-title" />
          <media-dialog-description class="media-dialog-description" />
        </div>
        <div className="media-dialog-actions">
          <media-dialog-close class="media-button media-dialog-close" />
        </div>
      </media-dialog-popup>
    </media-error-dialog>
    <media-title class="media-title" />
    <media-controls>
      <media-controls-backdrop class="video-controls-backdrop" />
      <media-controls-content class="video-controls video-controls-content">
        <media-tooltip-group>
          <media-controls-group class="video-controls-primary">
            {controlsStart}
            <media-play-button
              class="media-button media-play-button"
              id="vjs-6EpYm0RN-0-trigger"
            >
              <media-icon
                name="restart"
                class="media-button-icon media-play-button-restart-icon"
              />
              <media-icon
                name="play"
                class="media-button-icon media-play-button-play-icon"
              />
              <media-icon
                name="pause"
                class="media-button-icon media-play-button-pause-icon"
              />
            </media-play-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            {controlsAfterPlay}
            <media-mute-button
              commandfor="vjs-9Jipq7XQ-0-popup"
              class="media-button media-mute-button video-controls-volume-button"
              id="vjs-6EpYm0RN-0-2-trigger"
            >
              <media-icon
                name="volume-off"
                class="media-button-icon media-mute-button-off-icon"
              />
              <media-icon
                name="volume-low"
                class="media-button-icon media-mute-button-low-icon"
              />
              <media-icon
                name="volume-high"
                class="media-button-icon media-mute-button-high-icon"
              />
            </media-mute-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-2-trigger"
              delay="0"
              disabled
              sticky
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            <media-volume-popover
              open-on-hover
              delay="200"
              close-delay="100"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-volume-popover"
              id="vjs-9Jipq7XQ-0-popup"
            >
              <media-volume-slider
                class="media-slider media-volume-slider"
                thumb-alignment="edge"
                orientation="vertical"
              >
                <media-slider-track class="media-slider-track">
                  <media-slider-fill class="media-slider-fill" />
                </media-slider-track>
                <media-slider-thumb class="media-slider-thumb media-volume-slider-thumb" />
              </media-volume-slider>
            </media-volume-popover>
            <media-controls-group class="video-time-slider-group">
              <media-time
                class="media-time-value video-time-value"
                type="current"
              />
              <media-time-slider class="media-slider media-time-slider">
                {sliderLayer}
                <media-time-slider-chapters class="media-time-slider-chapters">
                  <Template
                    html={`<div class="media-time-slider-chapter"><media-slider-track class="media-slider-track media-time-slider-chapter-track"><media-slider-buffer class="media-slider-buffer media-time-slider-chapter-layer"></media-slider-buffer><media-slider-fill class="media-slider-fill media-time-slider-chapter-layer"></media-slider-fill></media-slider-track></div>`}
                  />
                </media-time-slider-chapters>
                <media-slider-thumb class="media-slider-thumb media-time-slider-thumb" />
                <media-slider-preview
                  class="media-slider-preview"
                  overflow="visible"
                >
                  <media-slider-thumbnail class="media-slider-preview-content media-popup-surface media-slider-thumbnail">
                    <img
                      alt=""
                      aria-hidden="true"
                      decoding="async"
                      className="media-slider-thumbnail-image"
                    />
                    <media-icon
                      name="spinner"
                      class="media-slider-thumbnail-spinner-icon"
                    />
                  </media-slider-thumbnail>
                  <div className="media-slider-preview-content media-time-slider-preview-content">
                    <media-time-slider-chapter-title class="media-time-slider-chapter-title" />
                    <media-slider-value
                      class="media-time-slider-value"
                      type="pointer"
                    />
                  </div>
                </media-slider-preview>
              </media-time-slider>
              <media-time
                class="media-time-toggle video-time-value"
                type="remaining"
                toggle
              />
            </media-controls-group>
            {controlsEnd}
            <media-captions-button
              class="media-button media-captions-button video-controls-captions-button"
              id="vjs-6EpYm0RN-0-3-trigger"
            >
              <media-icon
                name="captions-off"
                class="media-button-icon media-captions-button-off-icon"
              />
              <media-icon
                name="captions-on"
                class="media-button-icon media-captions-button-on-icon"
              />
            </media-captions-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-3-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            <button
              commandfor="vjs-Keqr6Ase-0-popup"
              className="media-button media-settings-menu-trigger video-controls-settings-button"
              id="vjs-6EpYm0RN-0-4-trigger"
            >
              <media-icon
                name="gear"
                class="media-button-icon-base media-settings-menu-trigger-icon"
              />
              <media-text
                class="media-settings-menu-trigger-label"
                token="menu.settings"
              >
                Settings
              </media-text>
            </button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-4-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-text token="menu.settings">Settings</media-text>
            </media-tooltip>
            <media-menu
              side="top"
              align="center"
              class="media-popup media-popup-surface media-menu-popup media-menu-resizable-popup"
              id="vjs-Keqr6Ase-0-popup"
            >
              <media-menu-content class="media-menu-content">
                {settingsItems}
                <media-menu-item
                  commandfor="vjs-tLacI0er-0-content"
                  class="media-menu-trigger-item"
                >
                  <media-icon
                    name="switches"
                    class="media-menu-trigger-item-icon"
                  />
                  <media-text token="menu.quality">Quality</media-text>
                  <span className="media-menu-hint">
                    <span
                      data-part="value"
                      className="media-menu-hint-label"
                    ></span>
                    <media-icon
                      name="chevron"
                      class="media-menu-forward-chevron"
                    />
                  </span>
                </media-menu-item>
                <media-menu-content
                  class="media-menu-content"
                  id="vjs-tLacI0er-0-content"
                >
                  <media-menu-item class="media-menu-back-item">
                    <media-icon
                      name="chevron"
                      class="media-menu-back-chevron"
                    />
                    <media-text token="menu.quality">Quality</media-text>
                  </media-menu-item>
                  <media-menu-separator class="media-menu-separator" />
                  <media-quality-radio-group class="media-menu-radio-group">
                    <Template
                      html={`<media-menu-radio-item class="media-menu-radio-item"><span><span data-part="label"></span><sup data-part="tier" class="media-menu-tier"></sup></span><span data-part="badge" class="media-menu-badge"></span><media-menu-item-indicator force-mount class="media-menu-item-indicator"><media-icon name="check" class="media-menu-radio-item-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                    />
                  </media-quality-radio-group>
                </media-menu-content>
                <media-menu-item
                  commandfor="vjs-Eo8DtgMd-0-content"
                  class="media-menu-trigger-item"
                >
                  <media-icon
                    name="speech"
                    class="media-menu-trigger-item-icon"
                  />
                  <media-text token="menu.audio">Audio</media-text>
                  <span className="media-menu-hint">
                    <span
                      data-part="value"
                      className="media-menu-hint-label"
                    ></span>
                    <media-icon
                      name="chevron"
                      class="media-menu-forward-chevron"
                    />
                  </span>
                </media-menu-item>
                <media-menu-content
                  class="media-menu-content"
                  id="vjs-Eo8DtgMd-0-content"
                >
                  <media-menu-item class="media-menu-back-item">
                    <media-icon
                      name="chevron"
                      class="media-menu-back-chevron"
                    />
                    <media-text token="menu.audio">Audio</media-text>
                  </media-menu-item>
                  <media-menu-separator class="media-menu-separator" />
                  <media-audio-track-radio-group class="media-menu-radio-group">
                    <Template
                      html={`<media-menu-radio-item class="media-menu-radio-item"><span data-part="label"></span><media-menu-item-indicator force-mount class="media-menu-item-indicator"><media-icon name="check" class="media-menu-radio-item-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                    />
                  </media-audio-track-radio-group>
                </media-menu-content>
                <media-menu-item
                  commandfor="vjs-H32r9IqW-0-content"
                  class="media-menu-trigger-item"
                >
                  <media-icon
                    name="speed"
                    class="media-menu-trigger-item-icon"
                  />
                  <media-text token="menu.speed">Speed</media-text>
                  <span className="media-menu-hint">
                    <span
                      data-part="value"
                      className="media-menu-hint-label"
                    ></span>
                    <media-icon
                      name="chevron"
                      class="media-menu-forward-chevron"
                    />
                  </span>
                </media-menu-item>
                <media-menu-content
                  class="media-menu-content"
                  id="vjs-H32r9IqW-0-content"
                >
                  <media-menu-item class="media-menu-back-item">
                    <media-icon
                      name="chevron"
                      class="media-menu-back-chevron"
                    />
                    <media-text token="menu.speed">Speed</media-text>
                  </media-menu-item>
                  <media-menu-separator class="media-menu-separator" />
                  <media-playback-rate-radio-group class="media-menu-radio-group">
                    <Template
                      html={`<media-menu-radio-item class="media-menu-radio-item"><span data-part="label"></span><media-menu-item-indicator force-mount class="media-menu-item-indicator"><media-icon name="check" class="media-menu-radio-item-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                    />
                  </media-playback-rate-radio-group>
                </media-menu-content>
                <media-menu-item
                  commandfor="vjs-rIQzx-29-0-content"
                  class="media-menu-trigger-item"
                >
                  <media-icon
                    name="captions-off"
                    class="media-menu-trigger-item-icon"
                  />
                  <media-text token="menu.captions">Captions</media-text>
                  <span className="media-menu-hint">
                    <span
                      data-part="value"
                      className="media-menu-hint-label"
                    ></span>
                    <media-icon
                      name="chevron"
                      class="media-menu-forward-chevron"
                    />
                  </span>
                </media-menu-item>
                <media-menu-content
                  class="media-menu-content"
                  id="vjs-rIQzx-29-0-content"
                >
                  <media-menu-item class="media-menu-back-item">
                    <media-icon
                      name="chevron"
                      class="media-menu-back-chevron"
                    />
                    <media-text token="menu.captions">Captions</media-text>
                  </media-menu-item>
                  <media-menu-separator class="media-menu-separator" />
                  <media-captions-radio-group class="media-menu-radio-group">
                    <Template
                      html={`<media-menu-radio-item class="media-menu-radio-item"><span data-part="label"></span><media-menu-item-indicator force-mount class="media-menu-item-indicator"><media-icon name="check" class="media-menu-radio-item-icon"></media-icon></media-menu-item-indicator></media-menu-radio-item>`}
                    />
                  </media-captions-radio-group>
                </media-menu-content>
              </media-menu-content>
            </media-menu>
          </media-controls-group>
          <media-controls-group class="video-controls-secondary">
            {controlsSecondary}
            <media-cast-button
              class="media-button media-cast-button"
              id="vjs-6EpYm0RN-0-5-trigger"
            >
              <media-icon
                name="cast-enter"
                class="media-button-icon media-cast-button-enter-icon"
              />
              <media-icon
                name="cast-exit"
                class="media-button-icon media-cast-button-exit-icon"
              />
            </media-cast-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-5-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            <media-airplay-button
              class="media-button media-airplay-button"
              id="vjs-6EpYm0RN-0-6-trigger"
            >
              <media-icon
                name="airplay-enter"
                class="media-button-icon media-airplay-button-enter-icon"
              />
              <media-icon
                name="airplay-exit"
                class="media-button-icon media-airplay-button-exit-icon"
              />
            </media-airplay-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-6-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            <media-pip-button
              class="media-button media-pip-button"
              id="vjs-6EpYm0RN-0-7-trigger"
            >
              <media-icon
                name="pip-enter"
                class="media-button-icon media-pip-button-enter-icon"
              />
              <media-icon
                name="pip-exit"
                class="media-button-icon media-pip-button-exit-icon"
              />
            </media-pip-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-7-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
            <media-fullscreen-button
              class="media-button media-fullscreen-button"
              id="vjs-6EpYm0RN-0-8-trigger"
            >
              <media-icon
                name="fullscreen-enter"
                class="media-button-icon media-fullscreen-button-enter-icon"
              />
              <media-icon
                name="fullscreen-exit"
                class="media-button-icon media-fullscreen-button-exit-icon"
              />
            </media-fullscreen-button>
            <media-tooltip
              trigger="vjs-6EpYm0RN-0-8-trigger"
              side="top"
              class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip"
            >
              <media-tooltip-label />
              <media-tooltip-shortcut class="media-tooltip-shortcut" />
            </media-tooltip>
          </media-controls-group>
        </media-tooltip-group>
      </media-controls-content>
    </media-controls>
    {/* Stash's v7 shortcuts; k, i and c stay with the scene page's tab and screenshot shortcuts. */}
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
    <media-hotkey keys=">" action="speedUp" />
    <media-hotkey keys="<" action="speedDown" />
    <media-hotkey keys="f" action="toggleFullscreen" />
    <media-gesture
      type="tap"
      action="togglePaused"
      pointer="mouse"
      region="center"
    />
    <media-gesture type="tap" action="toggleControls" pointer="touch" />
    <media-gesture type="doubletap" action="seekStep" region="left" />
    <media-gesture type="doubletap" action="toggleFullscreen" region="center" />
    <media-gesture type="doubletap" action="seekStep" region="right" />
    <media-status-announcer class="media-status-announcer" />
    <div className="video-status-indicators">
      <media-volume-indicator class="media-indicator media-volume-indicator">
        <media-volume-indicator-fill class="media-indicator-content media-volume-indicator-fill">
          <media-icon
            name="volume-high"
            class="media-volume-indicator-high-icon"
          />
          <media-icon
            name="volume-low"
            class="media-volume-indicator-low-icon"
          />
          <media-icon
            name="volume-off"
            class="media-volume-indicator-off-icon"
          />
          <media-volume-indicator-value class="media-volume-indicator-value" />
        </media-volume-indicator-fill>
      </media-volume-indicator>
      <media-status-indicator
        actions="toggleSubtitles,toggleFullscreen,togglePictureInPicture"
        class="media-indicator media-status-indicator"
      >
        <div className="media-indicator-content media-status-indicator-content">
          <media-icon
            name="captions-on"
            class="media-status-indicator-captions-on-icon"
          />
          <media-icon
            name="captions-off"
            class="media-status-indicator-captions-off-icon"
          />
          <media-icon
            name="fullscreen-enter"
            class="media-status-indicator-fullscreen-enter-icon"
          />
          <media-icon
            name="fullscreen-exit"
            class="media-status-indicator-fullscreen-exit-icon"
          />
          <media-icon
            name="pip-enter"
            class="media-status-indicator-pip-enter-icon"
          />
          <media-icon
            name="pip-exit"
            class="media-status-indicator-pip-exit-icon"
          />
          <media-status-indicator-value class="media-status-indicator-value" />
        </div>
      </media-status-indicator>
      <media-seek-indicator class="media-seek-indicator">
        <media-icon name="chevron" class="media-seek-indicator-icon" />
        <media-seek-indicator-value class="media-seek-indicator-value" />
      </media-seek-indicator>
      <media-status-indicator
        actions="togglePaused"
        class="media-playback-status-indicator"
      >
        <media-icon
          name="play"
          class="media-playback-status-indicator-play-icon"
        />
        <media-icon
          name="pause"
          class="media-playback-status-indicator-pause-icon"
        />
      </media-status-indicator>
    </div>
    {children}
  </media-container>
);
