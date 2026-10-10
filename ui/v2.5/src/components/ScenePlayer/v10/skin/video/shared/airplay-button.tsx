/** @jsxImportSource react */

import { AirPlayButton as AirPlayButtonPrimitive } from '@videojs/react';
import {
  AirPlayEnterIcon as AirPlayEnterIconPrimitive,
  AirPlayExitIcon as AirPlayExitIconPrimitive,
} from '@videojs/react/icons/compat';
import type { ClassValue } from 'cn';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';

export function AirPlayButton({ popupClassName }: { popupClassName?: ClassValue } = {}) {
  return (
    <ButtonTooltip popupClassName={popupClassName}>
      <AirPlayButtonPrimitive render={<Button />} className={'media-airplay-button'}>
        <AirPlayEnterIconPrimitive className={cn('media-button-icon', 'media-airplay-button-enter-icon')} />
        <AirPlayExitIconPrimitive className={cn('media-button-icon', 'media-airplay-button-exit-icon')} />
      </AirPlayButtonPrimitive>
    </ButtonTooltip>
  );
}
