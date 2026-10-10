/** @jsxImportSource react */

import { CaptionsButton as CaptionsButtonPrimitive } from '@videojs/react';
import {
  CaptionsOffIcon as CaptionsOffIconPrimitive,
  CaptionsOnIcon as CaptionsOnIconPrimitive,
} from '@videojs/react/icons/compat';

import { resolveClassName } from '@/lib/resolve-class-name';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';

export function CaptionsToggle() {
  return (
    <ButtonTooltip>
      <CaptionsButton />
    </ButtonTooltip>
  );
}

export type CaptionsButtonProps = Omit<CaptionsButtonPrimitive.Props, 'children'>;

export function CaptionsButton({ className, ...props }: CaptionsButtonProps = {}) {
  return (
    <CaptionsButtonPrimitive
      render={<Button />}
      className={(state) => cn('media-captions-button', resolveClassName(className, state))}
      {...props}
    >
      <CaptionsOffIconPrimitive className={cn('media-button-icon', 'media-captions-button-off-icon')} />
      <CaptionsOnIconPrimitive className={cn('media-button-icon', 'media-captions-button-on-icon')} />
    </CaptionsButtonPrimitive>
  );
}
