/** @jsxImportSource react */

import { ErrorDialog as ErrorDialogPrimitive } from '@videojs/react';

import { Button } from './button';

export function ErrorDialog() {
  return (
    <ErrorDialogPrimitive.Root>
      <ErrorDialogPrimitive.Backdrop className={'media-dialog-backdrop'} />
      <ErrorDialogPrimitive.Popup className={'media-dialog-popup'}>
        <ErrorDialogPrimitive.Title className={'media-dialog-title'} />
        <ErrorDialogPrimitive.Description className={'media-dialog-description'} />
        <ErrorDialogPrimitive.Close render={<Button />} className={'media-dialog-close'} />
      </ErrorDialogPrimitive.Popup>
    </ErrorDialogPrimitive.Root>
  );
}
