# Video.js 10 video skin

Video.js 10's Compat video skin, copied unmodified. Video.js publishes its skins for projects to copy and adapt, since the packaged skin elements can't take extra controls.

- `video/` is the `video` item of the Video.js shadcn registry's Compat catalog, https://shadcn.videojs.org/r/html/compat/video.json. `skin.html` is the skin's markup, kept for reference and for comparing updates.
- `styles/` holds the registry items it depends on: `_style-video-compat`, `_style-compat`, `_style-video` and `_style-theme`.

The registry follows Video.js's main branch rather than its releases. This copy was taken on 2026-10-10 for `@videojs/html` 10.0.1: every element, icon and import it uses exists in 10.0.1, and the files in `styles/` are identical to `packages/skins/src/styles` at the `@videojs/html@10.0.1` tag of https://github.com/videojs/v10, except for caption positions in `video/captions.css` and `video/theme.css`.
