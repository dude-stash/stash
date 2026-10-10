import React from "react";
import {
  faBackwardStep,
  faForwardStep,
  IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "src/components/Shared/Icon";
import { Button } from "./skin/video/shared/button";
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
