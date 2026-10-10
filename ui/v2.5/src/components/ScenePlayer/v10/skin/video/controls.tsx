/** @jsxImportSource react */

import { Controls } from '@videojs/react';

import { cn } from '@/lib/utils';

import { SeekButton } from './shared/seek-button';
import { SettingsMenu } from './shared/settings-menu';
import type { ThumbnailSlot } from './shared/time-slider';
import { VideoControlsContent } from './shared/video-controls';

export function VideoControls({ renderThumbnail }: ThumbnailSlot = {}) {
  return (
    <Controls.Root>
      <VideoControlsContent
        center
        menu={<SettingsMenu />}
        renderThumbnail={renderThumbnail}
        seekBackward={
          <SeekButton
            className={cn('video-controls-center-button', 'video-controls-center-seek')}
            iconClassName={'video-controls-center-seek-icon'}
            seconds={-10}
            tooltip={false}
          />
        }
        seekForward={
          <SeekButton
            className={cn('video-controls-center-button', 'video-controls-center-seek')}
            iconClassName={'video-controls-center-seek-icon'}
            seconds={10}
            tooltip={false}
          />
        }
      />
    </Controls.Root>
  );
}
