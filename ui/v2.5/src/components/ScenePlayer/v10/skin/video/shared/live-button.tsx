/** @jsxImportSource react */
import { badgeText } from '@videojs/core/i18n/text/live';
import { Text as TextPrimitive } from '@videojs/react';
import { LiveButton as LiveButtonPrimitive } from '@videojs/react';

import { Button } from './button';

export function LiveButton() {
  return (
    <LiveButtonPrimitive render={<Button />} className={'media-live-button'}>
      <div aria-hidden="true" className={'media-live-button-dot'} />
      <TextPrimitive token={badgeText.key}>{badgeText.text}</TextPrimitive>
    </LiveButtonPrimitive>
  );
}
