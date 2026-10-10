/** @jsxImportSource react */

import { VolumePopover as VolumePopoverPrimitive, VolumeSlider } from '@videojs/react';

import { cn } from '@/lib/utils';

import { MuteButton } from './mute-button';
import { ButtonTooltip } from './tooltip';

export function VolumePopover() {
  return (
    <VolumePopoverPrimitive.Root openOnHover delay={200} closeDelay={100} side="top">
      <ButtonTooltip delay={0} disabled sticky>
        <VolumePopoverPrimitive.Trigger render={<MuteButton />} />
      </ButtonTooltip>
      <VolumePopoverPrimitive.Popup
        className={cn('media-popup', 'media-popup-safe-area', 'media-popup-transition', 'media-volume-popover-popup')}
      >
        <VolumeSlider.Root className={'media-volume-slider'} orientation="vertical" thumbAlignment="edge">
          <VolumeSlider.Track className={'media-volume-slider-track'}>
            <VolumeSlider.Fill className={'media-volume-slider-fill'} />
          </VolumeSlider.Track>
          <VolumeSlider.Thumb className={'media-volume-slider-thumb'} />
        </VolumeSlider.Root>
      </VolumePopoverPrimitive.Popup>
    </VolumePopoverPrimitive.Root>
  );
}
