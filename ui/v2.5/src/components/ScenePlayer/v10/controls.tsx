import React, { useEffect, useRef, useState } from "react";
import "@videojs/html/ui/menu-radio-group";
import "@videojs/html/ui/menu-checkbox-item";
import {
  faBackwardStep,
  faForwardStep,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "src/components/Shared/Icon";

const TOOLTIP_CLASS =
  "media-popup media-popup-safe-area media-popup-transition media-tooltip-popup";

interface IControlButtonProps {
  id: string;
  label: string;
  icon: IconDefinition;
  onClick: () => void;
}

// A button styled like the skin's own controls, with the skin's tooltip.
const ControlButton: React.FC<IControlButtonProps> = ({
  id,
  label,
  icon,
  onClick,
}) => (
  <>
    <button
      type="button"
      id={id}
      className="media-button stash-control-button"
      aria-label={label}
      onClick={onClick}
    >
      <Icon icon={icon} className="media-button-icon" />
    </button>
    <media-tooltip trigger={id} side="top" class={TOOLTIP_CLASS}>
      {label}
    </media-tooltip>
  </>
);

export const SkipButton: React.FC<{
  direction: "previous" | "next";
  onClick: () => void;
}> = ({ direction, onClick }) => (
  <ControlButton
    id={`stash-skip-${direction}`}
    label={
      direction === "next" ? "Skip to next video" : "Skip to previous video"
    }
    icon={direction === "next" ? faForwardStep : faBackwardStep}
    onClick={onClick}
  />
);

// React 17 can't listen to custom events, so they are attached by hand through this callback ref.
function useCustomEvent<T>(type: string, handler: (detail: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!element) return;
    const listener = (e: Event) =>
      handlerRef.current((e as CustomEvent<T>).detail);
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
  }, [element, type]);

  return { ref: setElement, element };
}

export interface IRadioOption {
  value: string;
  label: string;
}

type OptionStateGroup = HTMLElement & {
  publishMenuOptionState?: (
    disabled: boolean,
    hidden: boolean,
    availability: string
  ) => void;
};

// A page in the skin's settings menu, built like its Quality page.
export const RadioSubmenu: React.FC<{
  id: string;
  label: string;
  icon: React.ReactNode;
  options: IRadioOption[];
  value?: string;
  onChange: (value: string) => void;
}> = ({ id, label, icon, options, value, onChange }) => {
  const group = useCustomEvent<{ value: string }>("value-change", (detail) =>
    onChange(detail.value)
  );
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  // The settings button hides when none of its pages report being available, which only Video.js's own pages do by themselves.
  // A report sent before the group is linked to its menu is dropped, so it is repeated until the menu marks this page's row.
  useEffect(() => {
    const el = group.element as OptionStateGroup | null;
    if (!el || !trigger) return;
    let frame = 0;
    let attempts = 0;

    function publish() {
      el?.publishMenuOptionState?.(false, false, "available");
      const linked = trigger?.getAttribute("data-availability") === "available";
      if (!linked && ++attempts < 60) frame = requestAnimationFrame(publish);
    }

    publish();
    return () => cancelAnimationFrame(frame);
  }, [group.element, trigger]);

  if (options.length < 2) return null;
  const current = options.find((o) => o.value === value);

  return (
    <>
      <media-menu-item ref={setTrigger} commandfor={id} class="media-menu-item">
        {icon}
        {label}
        <span className="media-menu-hint">
          <span className="media-menu-hint-label">{current?.label}</span>
          <media-icon
            family="compat"
            name="chevron"
            class="media-menu-forward-chevron"
          />
        </span>
      </media-menu-item>
      <media-menu-content class="media-menu-content" id={id}>
        <media-menu-item class="media-menu-back-item">
          <media-icon
            family="compat"
            name="chevron"
            class="media-menu-back-chevron"
          />
          {label}
        </media-menu-item>
        <media-menu-separator class="media-menu-separator" />
        <media-menu-radio-group
          ref={group.ref}
          class="media-menu-radio-group"
          value={value}
        >
          {options.map((option) => (
            <media-menu-radio-item
              key={option.value}
              class="media-menu-radio-item"
              value={option.value}
            >
              <span>{option.label}</span>
              <media-menu-item-indicator
                force-mount
                class="media-menu-indicator"
              >
                <media-icon
                  family="compat"
                  name="check"
                  class="media-menu-radio-icon"
                />
              </media-menu-item-indicator>
            </media-menu-radio-item>
          ))}
        </media-menu-radio-group>
      </media-menu-content>
    </>
  );
};

// Auto-start as a settings menu row with a switch, which stays open when toggled.
export const AutostartMenuItem: React.FC<{
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ enabled, onToggle }) => {
  const item = useCustomEvent<{ checked: boolean }>(
    "checked-change",
    (detail) => onToggle(detail.checked)
  );

  // React 17 would write checked="false", which still counts as checked, so the property is set instead.
  useEffect(() => {
    if (item.element)
      (item.element as HTMLElement & { checked: boolean }).checked = enabled;
  }, [item.element, enabled]);

  return (
    <media-menu-checkbox-item
      ref={item.ref}
      class="media-menu-item stash-autostart-item"
    >
      <media-icon family="compat" name="play" class="media-menu-trigger-icon" />
      Auto-start
      <span className="media-menu-hint">
        <span className="stash-switch" />
      </span>
    </media-menu-checkbox-item>
  );
};
