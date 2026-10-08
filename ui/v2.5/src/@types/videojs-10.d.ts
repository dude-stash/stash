import type React from "react";

// React 17 sets custom element props as attributes, so they are typed with their attribute names.
type CustomElementProps<T = object> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & { class?: string } & T;

type MediaElementProps = CustomElementProps<{
  src?: string;
  poster?: string;
  crossorigin?: string;
  playsinline?: string;
  preload?: string;
}>;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "video-player": CustomElementProps<{ "content-title"?: string }>;
      "video-skin": CustomElementProps;
      "hlsjs-video": MediaElementProps;
      "dash-video": MediaElementProps;
      "google-cast": CustomElementProps<{
        src?: string;
        "content-type"?: string;
      }>;
    }
  }
}
