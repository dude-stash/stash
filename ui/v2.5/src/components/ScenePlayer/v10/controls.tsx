import React from "react";
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
