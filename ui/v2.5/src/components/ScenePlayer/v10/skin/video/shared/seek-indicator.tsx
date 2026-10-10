/** @jsxImportSource react */

import { SeekIndicator as SeekIndicatorPrimitive } from '@videojs/react';
import { ChevronIcon as ChevronIconPrimitive } from '@videojs/react/icons/compat';

import { cn } from '@/lib/utils';

/** Feedback for the arrow-key and double-tap seeks, shown on the side it seeks towards. */
export function SeekIndicator() {
  return (
    <SeekIndicatorPrimitive.Root className={cn('media-indicator', 'media-seek-indicator')}>
      <ChevronIconPrimitive className={'media-seek-indicator-icon'} />
      <SeekIndicatorPrimitive.Value className={'media-seek-indicator-value'} />
    </SeekIndicatorPrimitive.Root>
  );
}
