import type React from "react";

// React 17 sets custom element props as attributes, so they are typed with their attribute names.
type CustomElementProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & { class?: string; [attribute: string]: unknown };

declare module "react" {
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    commandfor?: string;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "video-player": CustomElementProps;
      "hlsjs-video": CustomElementProps;
      "dash-video": CustomElementProps;
      "google-cast": CustomElementProps;
      [tag: `media-${string}`]: CustomElementProps;
    }
  }
}
