import React, { useEffect, useRef, useState } from "react";
import "@videojs/html/ui/menu-radio-group";
import "@videojs/html/ui/menu-checkbox-item";
import cx from "classnames";
import {
  faBackwardStep,
  faCirclePlay,
  faForwardStep,
  faPause,
  faPlay,
  faRepeat,
  faRotateLeft,
  faRotateRight,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "src/components/Shared/Icon";
import { seekBy, usePlayerState, usePlayerStore } from "./store";
import { IAbLoop } from "./hooks";

const TOOLTIP_CLASS =
  "media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip";

interface IControlButtonProps {
  id: string;
  label: string;
  icon?: IconDefinition;
  active?: boolean;
  className?: string;
  onClick: () => void;
}

// A button styled like the skin's own controls, with the skin's tooltip.
const ControlButton: React.FC<IControlButtonProps> = ({
  id,
  label,
  icon,
  active,
  className,
  onClick,
  children,
}) => (
  <>
    <button
      type="button"
      id={id}
      className={cx("media-button", "stash-control-button", className, {
        active,
      })}
      aria-label={label}
      onClick={onClick}
    >
      {icon ? <Icon icon={icon} className="media-button-icon" /> : children}
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

export const SeekButton: React.FC<{ seconds: number }> = ({ seconds }) => {
  const store = usePlayerStore();
  return (
    <ControlButton
      id={`stash-seek-${seconds}`}
      label={seconds < 0 ? `Back ${-seconds}s` : `Forward ${seconds}s`}
      icon={seconds < 0 ? faRotateLeft : faRotateRight}
      onClick={() => store && seekBy(store, seconds)}
    />
  );
};

export const AbLoopButtons: React.FC<{ abLoop: IAbLoop }> = ({ abLoop }) => {
  const store = usePlayerStore();
  const { options, setOptions } = abLoop;

  function setPoint(point: "start" | "end") {
    if (!store) return;
    const next = { ...options, [point]: store.currentTime };
    setOptions({ ...next, enabled: next.end !== false && next.end > 0 });
  }

  return (
    <>
      <ControlButton
        id="stash-abloop-start"
        label="Set loop start"
        className="stash-text-button"
        active={options.start > 0}
        onClick={() => setPoint("start")}
      >
        A
      </ControlButton>
      <ControlButton
        id="stash-abloop-end"
        label="Set loop end"
        className="stash-text-button"
        active={options.end !== false && options.end > 0}
        onClick={() => setPoint("end")}
      >
        B
      </ControlButton>
      <ControlButton
        id="stash-abloop-toggle"
        label={options.enabled ? "Disable A/B loop" : "Enable A/B loop"}
        icon={faRepeat}
        active={options.enabled}
        onClick={() => setOptions({ ...options, enabled: !options.enabled })}
      />
    </>
  );
};

// Shown on touch screens only, like v7's big button group.
export const BigButtons: React.FC = () => {
  const store = usePlayerStore();
  const paused = usePlayerState((s) => s.paused, true);
  const started = usePlayerState((s) => s.started, false);
  const visible = usePlayerState((s) => s.controlsVisible || s.paused, true);

  if (!store || !started) return null;

  return (
    <div className={cx("stash-big-buttons", { hidden: !visible })}>
      <button
        type="button"
        className="media-button"
        aria-label="Back 10s"
        onClick={() => seekBy(store, -10)}
      >
        <Icon icon={faRotateLeft} />
      </button>
      <button
        type="button"
        className="media-button"
        aria-label={paused ? "Play" : "Pause"}
        onClick={() => (paused ? store.play() : store.pause())}
      >
        <Icon icon={paused ? faPlay : faPause} />
      </button>
      <button
        type="button"
        className="media-button"
        aria-label="Forward 10s"
        onClick={() => seekBy(store, 10)}
      >
        <Icon icon={faRotateRight} />
      </button>
    </div>
  );
};

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

interface IRadioOption {
  value: string;
  label: string;
}

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

  if (options.length < 2) return null;
  const current = options.find((o) => o.value === value);

  return (
    <>
      <media-menu-item commandfor={id} class="media-menu-trigger-item">
        {icon}
        {label}
        <span className="media-menu-hint">
          <span className="media-menu-hint-label">{current?.label}</span>
          <media-icon name="chevron" class="media-menu-forward-chevron" />
        </span>
      </media-menu-item>
      <media-menu-content class="media-menu-content" id={id}>
        <media-menu-item class="media-menu-back-item">
          <media-icon name="chevron" class="media-menu-back-chevron" />
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
                class="media-menu-item-indicator"
              >
                <media-icon name="check" class="media-menu-radio-item-icon" />
              </media-menu-item-indicator>
            </media-menu-radio-item>
          ))}
        </media-menu-radio-group>
      </media-menu-content>
    </>
  );
};

// Auto-start as a settings menu row that stays open when toggled.
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
    <media-menu-checkbox-item ref={item.ref} class="media-menu-trigger-item">
      <Icon icon={faCirclePlay} className="media-menu-trigger-item-icon" />
      Auto-start
      <span className="media-menu-hint">
        <span className="media-menu-hint-label">{enabled ? "On" : "Off"}</span>
      </span>
    </media-menu-checkbox-item>
  );
};
