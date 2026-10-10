import React from "react";
import {
  audioText,
  captionsText,
  qualityText,
  settingsText,
} from "@videojs/core/i18n/text/menu";
import { Menu, Text } from "@videojs/react";
import {
  CaptionsOffIcon,
  ChevronIcon,
  GearIcon,
  SpeechIcon,
  SwitchesIcon,
} from "@videojs/react/icons/compat";
import { AudioTrackRadioGroup } from "@videojs/react/ui/audio-track-radio-group";
import { CaptionsRadioGroup } from "@videojs/react/ui/captions-radio-group";
import { QualityRadioGroup } from "@videojs/react/ui/quality-radio-group";
import { Button } from "./skin/video/shared/button";
import { RadioItem } from "./skin/video/shared/menu-item";
import { ButtonTooltip } from "./skin/video/shared/tooltip";

// The pages below are the copied skin's own, from ./skin/video/shared/settings-menu.tsx.

const QualityMenu: React.FC = () => (
  <Menu.Root>
    <QualityRadioGroup.Root>
      <Menu.Trigger className="media-menu-item">
        <SwitchesIcon className="media-menu-trigger-icon" />
        <Text token={qualityText.key}>{qualityText.text}</Text>
        <span className="media-menu-hint">
          <QualityRadioGroup.Value className="media-menu-hint-label" />
          <ChevronIcon className="media-menu-forward-chevron" />
        </span>
      </Menu.Trigger>
      <Menu.Content className="media-menu-content">
        <Menu.Item className="media-menu-back-item">
          <ChevronIcon className="media-menu-back-chevron" />
          <Text token={qualityText.key}>{qualityText.text}</Text>
        </Menu.Item>
        <Menu.Separator className="media-menu-separator" />
        <QualityRadioGroup.Options
          className="media-menu-radio-group"
          renderItem={(props, item) => (
            <RadioItem {...props}>
              <span>
                <span>{item.label}</span>
                {item.tier ? (
                  <sup className="media-menu-tier">{item.tier}</sup>
                ) : null}
              </span>
              {item.badge ? (
                <span className="media-menu-badge">{item.badge}</span>
              ) : null}
            </RadioItem>
          )}
        />
      </Menu.Content>
    </QualityRadioGroup.Root>
  </Menu.Root>
);

const AudioTrackMenu: React.FC = () => (
  <Menu.Root>
    <AudioTrackRadioGroup.Root>
      <Menu.Trigger className="media-menu-item">
        <SpeechIcon className="media-menu-trigger-icon" />
        <Text token={audioText.key}>{audioText.text}</Text>
        <span className="media-menu-hint">
          <AudioTrackRadioGroup.Value className="media-menu-hint-label" />
          <ChevronIcon className="media-menu-forward-chevron" />
        </span>
      </Menu.Trigger>
      <Menu.Content className="media-menu-content">
        <Menu.Item className="media-menu-back-item">
          <ChevronIcon className="media-menu-back-chevron" />
          <Text token={audioText.key}>{audioText.text}</Text>
        </Menu.Item>
        <Menu.Separator className="media-menu-separator" />
        <AudioTrackRadioGroup.Options
          className="media-menu-radio-group"
          renderItem={(props, item) => (
            <RadioItem {...props}>
              <span>{item.label}</span>
            </RadioItem>
          )}
        />
      </Menu.Content>
    </AudioTrackRadioGroup.Root>
  </Menu.Root>
);

const CaptionsMenu: React.FC = () => (
  <Menu.Root>
    <CaptionsRadioGroup.Root>
      <Menu.Trigger className="media-menu-item">
        <CaptionsOffIcon className="media-menu-trigger-icon" />
        <Text token={captionsText.key}>{captionsText.text}</Text>
        <span className="media-menu-hint">
          <CaptionsRadioGroup.Value className="media-menu-hint-label" />
          <ChevronIcon className="media-menu-forward-chevron" />
        </span>
      </Menu.Trigger>
      <Menu.Content className="media-menu-content">
        <Menu.Item className="media-menu-back-item">
          <ChevronIcon className="media-menu-back-chevron" />
          <Text token={captionsText.key}>{captionsText.text}</Text>
        </Menu.Item>
        <Menu.Separator className="media-menu-separator" />
        <CaptionsRadioGroup.Options
          className="media-menu-radio-group"
          renderItem={(props, item) => (
            <RadioItem {...props}>
              <span>{item.label}</span>
            </RadioItem>
          )}
        />
      </Menu.Content>
    </CaptionsRadioGroup.Root>
  </Menu.Root>
);

export interface ISettingsMenuSlots {
  settingsStart?: React.ReactNode;
  settingsSpeed?: React.ReactNode;
  settingsEnd?: React.ReactNode;
}

// The copied skin's settings menu, with places for Stash's pages; Speed is Stash's, since the skin's can't take the v7 player's speeds.
export const SettingsMenu: React.FC<ISettingsMenuSlots> = ({
  settingsStart,
  settingsSpeed,
  settingsEnd,
}) => (
  <Menu.Root side="top" align="center">
    <ButtonTooltip
      label={<Text token={settingsText.key}>{settingsText.text}</Text>}
    >
      <Menu.Trigger render={<Button />} className="media-settings-button">
        <GearIcon className="media-button-icon media-settings-button-icon" />
        <Text className="media-settings-button-label" token={settingsText.key}>
          {settingsText.text}
        </Text>
      </Menu.Trigger>
    </ButtonTooltip>
    <Menu.Popup
      keepMounted
      className="media-popup media-popup-safe-area media-menu-popup media-menu-resizable-popup"
    >
      <Menu.Content className="media-menu-content">
        {settingsStart}
        <QualityMenu />
        <AudioTrackMenu />
        {settingsSpeed}
        <CaptionsMenu />
        {settingsEnd}
      </Menu.Content>
    </Menu.Popup>
  </Menu.Root>
);
