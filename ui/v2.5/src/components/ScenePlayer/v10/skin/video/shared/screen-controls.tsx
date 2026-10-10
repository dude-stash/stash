/** @jsxImportSource react */

import {
  CastButton as CastButtonPrimitive,
  PiPButton as PiPButtonPrimitive,
  FullscreenButton as FullscreenButtonPrimitive,
} from '@videojs/react';
import {
  CastEnterIcon as CastEnterIconPrimitive,
  CastExitIcon as CastExitIconPrimitive,
  PipEnterIcon as PipEnterIconPrimitive,
  PipExitIcon as PipExitIconPrimitive,
  FullscreenEnterIcon as FullscreenEnterIconPrimitive,
  FullscreenExitIcon as FullscreenExitIconPrimitive,
} from '@videojs/react/icons/compat';

import { cn } from '@/lib/utils';

import { AirPlayButton } from './airplay-button';
import { Button } from './button';
import { ButtonTooltip } from './tooltip';

function CastButton() {
  return (
    <ButtonTooltip popupClassName={'media-tooltip-screen-popup'}>
      <CastButtonPrimitive render={<Button />} className={'media-cast-button'}>
        <CastEnterIconPrimitive className={cn('media-button-icon', 'media-cast-button-enter-icon')} />
        <CastExitIconPrimitive className={cn('media-button-icon', 'media-cast-button-exit-icon')} />
      </CastButtonPrimitive>
    </ButtonTooltip>
  );
}

function PiPButton() {
  return (
    <ButtonTooltip popupClassName={'media-tooltip-screen-popup'}>
      <PiPButtonPrimitive render={<Button />} className={'media-pip-button'}>
        <PipEnterIconPrimitive className={cn('media-button-icon', 'media-pip-button-enter-icon')} />
        <PipExitIconPrimitive className={cn('media-button-icon', 'media-pip-button-exit-icon')} />
      </PiPButtonPrimitive>
    </ButtonTooltip>
  );
}

function FullscreenButton() {
  return (
    <ButtonTooltip popupClassName={'media-tooltip-screen-popup'}>
      <FullscreenButtonPrimitive render={<Button />} className={'media-fullscreen-button'}>
        <FullscreenEnterIconPrimitive className={cn('media-button-icon', 'media-fullscreen-button-enter-icon')} />
        <FullscreenExitIconPrimitive className={cn('media-button-icon', 'media-fullscreen-button-exit-icon')} />
      </FullscreenButtonPrimitive>
    </ButtonTooltip>
  );
}

export function ScreenControls() {
  return (
    <>
      <AirPlayButton popupClassName={'media-tooltip-screen-popup'} />
      <CastButton />
      <PiPButton />
      <FullscreenButton />
    </>
  );
}
