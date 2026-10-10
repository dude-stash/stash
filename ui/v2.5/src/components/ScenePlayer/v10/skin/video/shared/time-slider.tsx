/** @jsxImportSource react */

import { Slider as SliderPrimitive } from '@videojs/react';
import { TimeSlider as TimeSliderPrimitive } from '@videojs/react';

import { cn } from '@/lib/utils';

export function TimeSlider({ audio = false, renderThumbnail }: ThumbnailSlot & { audio?: boolean } = {}) {
  return (
    <div className={'video-controls-slider-row'}>
      <TimeSliderPrimitive.Root className={'media-time-slider'} thumbAlignment="edge">
        <TimeSliderPrimitive.Chapters
          className={'media-time-slider-chapters'}
          renderChapter={(props) => (
            <div className={'media-time-slider-chapter'} {...props}>
              <TimeSliderPrimitive.Track
                className={cn('media-time-slider-track', audio && 'media-time-slider-audio-track')}
              >
                <TimeSliderPrimitive.Buffer
                  className={cn('media-time-slider-buffer', audio && 'media-time-slider-audio-buffer')}
                />
                <TimeSliderPrimitive.Fill className={'media-time-slider-fill'} />
              </TimeSliderPrimitive.Track>
            </div>
          )}
        ></TimeSliderPrimitive.Chapters>
        <TimeSliderPrimitive.Thumb className={'media-time-slider-thumb'} />

        <TimeSliderPrimitive.Preview className={'media-time-slider-preview'}>
          <SliderPrimitive.Thumbnail.Root className={'media-slider-thumbnail'}>
            <SliderPrimitive.Thumbnail.Image render={renderThumbnail} className={'media-slider-thumbnail-image'} />
          </SliderPrimitive.Thumbnail.Root>
          <div className={cn('media-time-slider-preview-meta', audio && 'media-time-slider-audio-preview-meta')}>
            <div className={'media-time-slider-preview-label'}>
              <TimeSliderPrimitive.Value className={'media-time-slider-value'} type="pointer" />
              <TimeSliderPrimitive.ChapterTitle className={'media-time-slider-chapter-title'} />
            </div>
          </div>
        </TimeSliderPrimitive.Preview>
      </TimeSliderPrimitive.Root>
    </div>
  );
}

export interface ThumbnailSlot {
  /** Draws the storyboard frame in the slider preview in place of the one the skin renders. */
  renderThumbnail?: SliderPrimitive.Thumbnail.ImageProps['render'];
}
