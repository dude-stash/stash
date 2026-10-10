/** @jsxImportSource react */

import { SeekButton as SeekButtonPrimitive } from '@videojs/react';
import { SeekIcon as SeekIconPrimitive } from '@videojs/react/icons/compat';
import type { ClassValue } from 'cn';

import { resolveClassName } from '@/lib/resolve-class-name';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';

/**
 * Skips playback by a fixed amount. `seconds` has to match the arrow-key hotkey the skin registers, or the engine will
 * not mirror `aria-keyshortcuts` onto the button.
 */
export function SeekButton({
  className,
  iconClassName,
  seconds,
  tooltip = true,
}: {
  className?: ClassValue;
  iconClassName?: ClassValue;
  seconds: number;
  tooltip?: boolean;
}) {
  const backward = seconds < 0;

  return (
    <ButtonTooltip disabled={!tooltip}>
      <SeekButtonPrimitive
        render={<Button />}
        className={(state) => cn(resolveClassName(className, state))}
        seconds={seconds}
      >
        <div className={'media-seek-button-content'}>
          <SeekIconPrimitive
            className={cn('media-button-icon', backward && 'media-seek-button-backward-icon', iconClassName)}
          />
          <span
            className={cn(
              'media-seek-button-label',
              backward ? 'media-seek-button-backward-label' : 'media-seek-button-forward-label'
            )}
          >
            {Math.abs(seconds)}
          </span>
        </div>
      </SeekButtonPrimitive>
    </ButtonTooltip>
  );
}
