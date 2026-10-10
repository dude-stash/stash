/** @jsxImportSource react */

import { Time, Controls, Tooltip, BufferingIndicator } from '@videojs/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { AirPlayButton } from './airplay-button';
import { CaptionsToggle } from './captions-button';
import { LiveButton } from './live-button';
import { PlayButton } from './play-button';
import { TimeSlider } from './time-slider';
import { type ThumbnailSlot } from './time-slider';
import { VolumePopover } from './volume-popover';

export function ControlsRow({
  audio = false,
  live = false,
  menu,
  rate,
  seekBackward,
  seekForward,
}: ControlsSlots & { audio?: boolean; live?: boolean; menu?: ReactNode } = {}) {
  return (
    <Controls.Group className={'video-controls-row'}>
      <Controls.Group className={cn('video-controls-group', 'video-controls-start')}>
        <PlayButton />
        {seekBackward}
        {seekForward}
        {live && <LiveButton />}
        {audio ? rate : <VolumePopover />}
        {!live && (
          <Time.Group className={'media-time-group'}>
            <Time.Value className={'media-time-toggle'} type="current" toggle />
            <Time.Value className={'media-time-current-value'} type="current" />
            <Time.Separator className={'media-time-separator'} />
            <Time.Value className={'media-time-duration-value'} type="duration" />
          </Time.Group>
        )}
      </Controls.Group>

      <Controls.Group className={'video-controls-group'}>
        {(!live || audio) && <CaptionsToggle />}
        {menu ?? (audio && <VolumePopover />)}
        {audio && <AirPlayButton />}
      </Controls.Group>
    </Controls.Group>
  );
}

export interface ControlsSlots extends ThumbnailSlot {
  /** The playback-rate control, supplied by the on-demand audio preset. */
  rate?: ReactNode;
  /** The skip-back control, supplied by the presets that have a timeline. */
  seekBackward?: ReactNode;
  /** The skip-forward control, supplied by the presets that have a timeline. */
  seekForward?: ReactNode;
}

export function ControlsContent({
  audio = false,
  center = false,
  live = false,
  menu,
  rate,
  renderThumbnail,
  seekBackward,
  seekForward,
  top,
}: ControlsSlots & { audio?: boolean; center?: boolean; live?: boolean; menu?: ReactNode; top?: ReactNode } = {}) {
  return (
    <BufferingIndicator className={'video-controls-buffering'}>
      {!audio && <Controls.Backdrop className={'video-controls-backdrop'} />}
      <Controls.Content className={cn('video-controls-content', audio && 'audio-controls-content')}>
        <Tooltip.Provider>
          {top && <Controls.Group className={'video-controls-top'}>{top}</Controls.Group>}
          {center && (
            <Controls.Group className={'video-controls-center'}>
              {seekBackward}
              <PlayButton
                className={cn('video-controls-center-button', 'video-controls-center-play')}
                iconClassName={'video-controls-center-play-icon'}
                tooltip={false}
              />
              {seekForward}
            </Controls.Group>
          )}
          <div
            className={cn(
              'video-controls-bottom',
              audio && 'audio-controls-bottom',
              !audio && 'video-controls-video-bottom'
            )}
          >
            {!live && <TimeSlider audio={audio} renderThumbnail={renderThumbnail} />}
            <ControlsRow
              audio={audio}
              live={live}
              menu={menu}
              rate={rate}
              seekBackward={center ? undefined : seekBackward}
              seekForward={center ? undefined : seekForward}
            />
          </div>
        </Tooltip.Provider>
      </Controls.Content>
    </BufferingIndicator>
  );
}
