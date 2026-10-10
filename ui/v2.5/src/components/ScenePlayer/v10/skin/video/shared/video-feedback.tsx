/** @jsxImportSource react */

import { Poster as PosterPrimitive } from '@videojs/react';
import { BufferingIndicator as BufferingIndicatorPrimitive } from '@videojs/react';
import { SpinnerIcon as SpinnerIconPrimitive } from '@videojs/react/icons/compat';

export function Poster({ renderImage }: { renderImage?: PosterPrimitive.ImageProps['render'] } = {}) {
  return (
    <PosterPrimitive.Root className={'media-poster'}>
      <PosterPrimitive.Image render={renderImage} className={'media-poster-image'} />
    </PosterPrimitive.Root>
  );
}

export function BufferingIndicator() {
  return (
    <BufferingIndicatorPrimitive className={'media-buffering-indicator'}>
      <SpinnerIconPrimitive className={'media-buffering-indicator-spinner-icon'} />
    </BufferingIndicatorPrimitive>
  );
}
