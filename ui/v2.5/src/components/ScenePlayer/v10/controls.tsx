import React, { useEffect, useRef } from "react";
import "@videojs/html/ui/menu-radio-group";
import cx from "classnames";
import {
  faBackwardStep,
  faBan,
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

export const AutostartButton: React.FC<{
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ enabled, onToggle }) => (
  <ControlButton
    id="stash-autostart"
    label={
      enabled
        ? "Auto-start enabled (click to disable)"
        : "Auto-start disabled (click to enable)"
    }
    icon={enabled ? faCirclePlay : faBan}
    onClick={() => onToggle(!enabled)}
  />
);

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

interface ISourceOption {
  url: string;
  label: string;
}

// A Source page in the skin's settings menu, built like its Quality page.
export const SourceMenu: React.FC<{
  sources: ISourceOption[];
  value?: string;
  onChange: (url: string) => void;
}> = ({ sources, value, onChange }) => {
  const groupRef = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // React 17 can't listen to custom events, so this one is attached by hand.
    const listener = (e: Event) =>
      onChangeRef.current((e as CustomEvent<{ value: string }>).detail.value);
    group.addEventListener("value-change", listener);
    return () => group.removeEventListener("value-change", listener);
  }, []);

  if (sources.length < 2) return null;
  const current = sources.find((s) => s.url === value);

  return (
    <>
      <media-menu-item
        commandfor="stash-source-content"
        class="media-menu-trigger-item"
      >
        <media-icon name="switches" class="media-menu-trigger-item-icon" />
        Source
        <span className="media-menu-hint">
          <span className="media-menu-hint-label">{current?.label}</span>
          <media-icon name="chevron" class="media-menu-forward-chevron" />
        </span>
      </media-menu-item>
      <media-menu-content class="media-menu-content" id="stash-source-content">
        <media-menu-item class="media-menu-back-item">
          <media-icon name="chevron" class="media-menu-back-chevron" />
          Source
        </media-menu-item>
        <media-menu-separator class="media-menu-separator" />
        <media-menu-radio-group
          ref={groupRef}
          class="media-menu-radio-group"
          value={value}
        >
          {sources.map((source) => (
            <media-menu-radio-item
              key={source.url}
              class="media-menu-radio-item"
              value={source.url}
            >
              <span>{source.label}</span>
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
