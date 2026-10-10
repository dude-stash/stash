# Video.js 10 video skin

Video.js 10's Compat video skin for React, copied unmodified. Video.js publishes its skins for projects to copy and adapt, since the packaged skin components can't take extra controls.

- `video/` is the `video` item of the Video.js shadcn registry's React Compat catalog with plain CSS, https://shadcn.videojs.org/r/react/css/compat/video.json.
- `lib/` and `styles/` hold the registry items it depends on: `_resolve-class-name`, `_style-video-compat`, `_style-compat`, `_style-video` and `_style-theme`.

The skin imports the `cn` helper that shadcn expects each project to provide from `@/lib/utils`. Stash's is `../cn.ts`, and `tsconfig.json` maps `@/lib/utils` to it and the rest of `@/lib` to `lib/`.

The registry follows Video.js's main branch rather than its releases. This copy was taken on 2026-10-10 for `@videojs/react` 10.0.1, and type-checks against it. The files in `styles/` are identical to `packages/skins/src/styles` at the `@videojs/html@10.0.1` tag of https://github.com/videojs/v10, except for caption positions in `video/captions.css` and `video/theme.css`.
