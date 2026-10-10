/** @jsxImportSource react */

import {
  StatusIndicator as StatusIndicatorPrimitive,
  VolumeIndicator as VolumeIndicatorPrimitive,
} from '@videojs/react';
import {
  CaptionsOnIcon as CaptionsOnIconPrimitive,
  CaptionsOffIcon as CaptionsOffIconPrimitive,
  FullscreenEnterIcon as FullscreenEnterIconPrimitive,
  FullscreenExitIcon as FullscreenExitIconPrimitive,
  PipEnterIcon as PipEnterIconPrimitive,
  PipExitIcon as PipExitIconPrimitive,
  VolumeHighIcon as VolumeHighIconPrimitive,
  VolumeLowIcon as VolumeLowIconPrimitive,
  VolumeOffIcon as VolumeOffIconPrimitive,
} from '@videojs/react/icons/compat';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const STATUS_ACTIONS = ['toggleSubtitles', 'toggleFullscreen', 'togglePictureInPicture'] as const;

/**
 * Transient feedback stacks above the title and below the controls, and never takes pointer input. The whole group is
 * hidden from assistive technology: `StatusAnnouncer` already speaks these same events, so exposing both would announce
 * every one of them twice.
 */
export function Indicators({ children }: { children?: ReactNode } = {}) {
  return (
    <div aria-hidden="true" className={'media-indicator-group'}>
      <VolumeIndicator />
      <StatusIndicator />
      {children}
    </div>
  );
}

function StatusIndicator() {
  return (
    <StatusIndicatorPrimitive.Root actions={STATUS_ACTIONS} className={cn('media-indicator', 'media-status-indicator')}>
      <CaptionsOnIconPrimitive
        className={cn('media-status-indicator-icon', 'media-status-indicator-captions-on-icon')}
      />
      <CaptionsOffIconPrimitive
        className={cn('media-status-indicator-icon', 'media-status-indicator-captions-off-icon')}
      />
      <FullscreenEnterIconPrimitive
        className={cn('media-status-indicator-icon', 'media-status-indicator-fullscreen-enter-icon')}
      />
      <FullscreenExitIconPrimitive
        className={cn('media-status-indicator-icon', 'media-status-indicator-fullscreen-exit-icon')}
      />
      <PipEnterIconPrimitive className={cn('media-status-indicator-icon', 'media-status-indicator-pip-enter-icon')} />
      <PipExitIconPrimitive className={cn('media-status-indicator-icon', 'media-status-indicator-pip-exit-icon')} />
      <StatusIndicatorPrimitive.Value />
    </StatusIndicatorPrimitive.Root>
  );
}

function VolumeIndicator() {
  return (
    <VolumeIndicatorPrimitive.Root className={cn('media-indicator', 'media-volume-indicator')}>
      <VolumeIndicatorPrimitive.Fill className={'media-volume-indicator-fill'}>
        <VolumeHighIconPrimitive className={cn('media-volume-indicator-icon', 'media-volume-indicator-high-icon')} />
        <VolumeLowIconPrimitive className={cn('media-volume-indicator-icon', 'media-volume-indicator-low-icon')} />
        <VolumeOffIconPrimitive className={cn('media-volume-indicator-icon', 'media-volume-indicator-off-icon')} />
        <VolumeIndicatorPrimitive.Value className={'media-volume-indicator-value'} />
      </VolumeIndicatorPrimitive.Fill>
    </VolumeIndicatorPrimitive.Root>
  );
}
