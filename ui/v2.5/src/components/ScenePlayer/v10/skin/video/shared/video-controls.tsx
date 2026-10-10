/** @jsxImportSource react */

import type { ReactNode } from 'react';

import { ControlsContent, type ControlsSlots } from './controls';
import { ScreenControls } from './screen-controls';

export function VideoControlsContent({
  center = false,
  live = false,
  menu,
  renderThumbnail,
  seekBackward,
  seekForward,
}: ControlsSlots & { center?: boolean; live?: boolean; menu?: ReactNode } = {}) {
  return (
    <ControlsContent
      center={center}
      live={live}
      menu={menu}
      renderThumbnail={renderThumbnail}
      seekBackward={seekBackward}
      seekForward={seekForward}
      top={<ScreenControls />}
    />
  );
}
