/** @jsxImportSource react */

import { Menu as MenuPrimitive } from '@videojs/react';
import { CheckIcon as CheckIconPrimitive } from '@videojs/react/icons/compat';

export function RadioItem({ children, ...props }: MenuPrimitive.RadioItemProps) {
  return (
    <MenuPrimitive.RadioItem className={'media-menu-radio-item'} {...props}>
      {children}
      <MenuPrimitive.ItemIndicator forceMount className={'media-menu-indicator'}>
        <CheckIconPrimitive className={'media-menu-radio-icon'} />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}
