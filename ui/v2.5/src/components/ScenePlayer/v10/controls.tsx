import React, { useLayoutEffect } from "react";
import {
  faBackwardStep,
  faForwardStep,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { Menu, useMenuContext } from "@videojs/react";
import { ChevronIcon, PlayIcon } from "@videojs/react/icons/compat";
import { Icon } from "src/components/Shared/Icon";
import { formatLoopTime, IAbLoop, IAbLoopOptions } from "./abloop";
import { Button } from "./skin/video/shared/button";
import { RadioItem } from "./skin/video/shared/menu-item";
import { ButtonTooltip } from "./skin/video/shared/tooltip";

interface IControlButtonProps {
  label: string;
  icon: IconDefinition;
  onClick: () => void;
}

// A button styled like the skin's own controls, with the skin's tooltip.
const ControlButton: React.FC<IControlButtonProps> = ({
  label,
  icon,
  onClick,
}) => (
  <ButtonTooltip label={label}>
    <Button type="button" aria-label={label} onClick={onClick}>
      <Icon icon={icon} className="media-button-icon" />
    </Button>
  </ButtonTooltip>
);

export const SkipButton: React.FC<{
  direction: "previous" | "next";
  onClick: () => void;
}> = ({ direction, onClick }) => (
  <ControlButton
    label={
      direction === "next" ? "Skip to next video" : "Skip to previous video"
    }
    icon={direction === "next" ? faForwardStep : faBackwardStep}
    onClick={onClick}
  />
);

function getLoopLabel(options: IAbLoopOptions) {
  if (!options.enabled) return "Loop off";
  if (options.pauseBeforeLooping && options.pauseAfterLooping) {
    return "PAUSE LOOP PAUSE";
  }
  if (options.pauseAfterLooping) return "LOOP& PAUSE";
  if (options.pauseBeforeLooping) return "PAUSE &LOOP";
  return "LOOP ON";
}

// videojs-abloop's buttons as v7 shows them: click sets a point and right-click goes to it, with Shift and Ctrl nudging it by 0.5s and 0.05s.
export const AbLoopButtons: React.FC<{ abLoop: IAbLoop }> = ({ abLoop }) => {
  const { options, setPoint, adjustPoint, goToPoint, toggle, cyclePauseModes } =
    abLoop;

  function pointProps(point: "start" | "end") {
    return {
      onClick: (event: React.MouseEvent) => {
        if (event.shiftKey) adjustPoint(point, -0.5);
        else if (event.ctrlKey) adjustPoint(point, -0.05);
        else setPoint(point);
      },
      onMouseDown: (event: React.MouseEvent) => {
        if (event.button !== 2) return;
        if (event.shiftKey) adjustPoint(point, 0.5);
        else if (event.ctrlKey) adjustPoint(point, 0.05);
        else goToPoint(point);
      },
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    };
  }

  return (
    <>
      <Button
        type="button"
        className="stash-text-button"
        aria-label="Loop start"
        {...pointProps("start")}
      >
        {formatLoopTime(options.start)}
      </Button>
      <Button
        type="button"
        className="stash-text-button"
        aria-label="Loop end"
        {...pointProps("end")}
      >
        {formatLoopTime(options.end === false ? 0 : options.end)}
      </Button>
      <Button
        type="button"
        className="stash-text-button"
        aria-label="Loop"
        onClick={toggle}
        onMouseDown={(event) => event.button === 2 && cyclePauseModes()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {getLoopLabel(options)}
      </Button>
    </>
  );
};

// The settings button hides unless one of its pages reports being available, which only Video.js's own pages do by themselves.
function useAvailableMenuPage(available: boolean) {
  const { setOptionState } = useMenuContext();

  useLayoutEffect(() => {
    if (!available) return;
    const source = Symbol("stash-menu-page");
    setOptionState(source, {
      value: "",
      disabled: false,
      hidden: false,
      availability: "available",
    });
    return () => setOptionState(source, null);
  }, [available, setOptionState]);
}

export interface IRadioOption {
  value: string;
  label: string;
}

// A page in the settings menu, laid out like the skin's own.
export const RadioSubmenu: React.FC<{
  label: string;
  icon: React.ReactNode;
  options: IRadioOption[];
  value?: string;
  onChange: (value: string) => void;
}> = ({ label, icon, options, value, onChange }) => {
  useAvailableMenuPage(options.length > 1);
  if (options.length < 2) return null;
  const current = options.find((o) => o.value === value);

  return (
    <Menu.Root>
      <Menu.Trigger className="media-menu-item">
        {icon}
        {label}
        <span className="media-menu-hint">
          <span className="media-menu-hint-label">{current?.label}</span>
          <ChevronIcon className="media-menu-forward-chevron" />
        </span>
      </Menu.Trigger>
      <Menu.Content className="media-menu-content">
        <Menu.Item className="media-menu-back-item">
          <ChevronIcon className="media-menu-back-chevron" />
          {label}
        </Menu.Item>
        <Menu.Separator className="media-menu-separator" />
        <Menu.RadioGroup
          className="media-menu-radio-group"
          value={value ?? ""}
          onValueChange={onChange}
        >
          {options.map((option) => (
            <RadioItem key={option.value} value={option.value}>
              <span>{option.label}</span>
            </RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
};

// Auto-start as a settings menu row with a switch.
export const AutostartMenuItem: React.FC<{
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ enabled, onToggle }) => (
  <Menu.CheckboxItem
    className="media-menu-item stash-autostart-item"
    checked={enabled}
    onCheckedChange={onToggle}
  >
    <PlayIcon className="media-menu-trigger-icon" />
    Auto-start
    <span className="media-menu-hint">
      <span className="stash-switch" />
    </span>
  </Menu.CheckboxItem>
);
