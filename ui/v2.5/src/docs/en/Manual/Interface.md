# Interface options

## Language

Setting the language affects the formatting of numbers and dates.

## SFW content mode

SFW content mode is used to indicate that the content being managed is _not_ adult content. 

When SFW content mode is enabled, the following changes are made to the UI:
- default performer images are changed to less adult-oriented images
- certain adult-specific metadata fields are hidden (e.g. performer genital fields)
- `O`-Counter is replaced with `Like`-counter

## Scene/marker wall preview type

The Scene Wall and Marker pages display scene preview videos (mp4) by default. This can be changed to animated image (webp) or static image. 

> **⚠️ Note:** scene/marker preview videos must be generated to see them in the applicable wall page if Video preview type is selected. Likewise, if Animated image is selected, then Image Previews must be generated.

## Show studio overlay as text

By default, in the grid card view the studio will be shown as an image overlay of the studio logo. Checking this option changes this to display studios as a text name instead.

## Scene player options

By default, scene videos do not automatically start when navigating to the scenes page. Checking the "Auto-start video" option changes this to auto play scene videos.

The maximum loop duration option allows looping of shorter videos. Set this value to the maximum scene duration that scene videos should loop. Setting this to 0 disables this functionality.

### Chromecast

Enable Chromecast under Scene player options to show the Cast button in the
player. Casting works from Chrome, Edge and Opera; Safari and Firefox cannot run
Google's Cast sender, and on iOS every browser is Safari underneath.

Stash must be open over **HTTPS** or as **`http://localhost`** — the Cast sender
refuses to start on `http://192.168.x.x`. The Chromecast itself is the opposite:
it fetches the video on its own and cannot reach `localhost`, so Stash sends it
one of this machine's LAN addresses instead. Both sides therefore work at once,
and you do not need to change how you open Stash.

The Chromecast also cannot decode every file Stash can serve. Direct streaming is
used only when the scene is already H.264 video with AAC audio in an MP4
container; anything else is transcoded on the fly, and the first few seconds can
take 10 to 30 seconds to appear while ffmpeg starts up. A scene with no format
the device can play reports that instead of casting.

If your instance requires a login, casting still works: stream URLs are signed,
so the device does not need your session cookie.

Two things Stash cannot work around. The sender and the Chromecast have to be on
the same network. And if you reach Stash by a hostname rather than an IP, that
name has to resolve for the Chromecast too, which uses Google's DNS — a
LAN-only name will not answer. Opening Stash at `http://localhost` avoids this,
because Stash substitutes the LAN address itself.

### Activity tracking

The "Track Activity" option allows tracking of scene play count and duration, and sets the resume point when a scene video is not finished.

The "Minimum play percent" gives the minimum proportion of a video that must be played before the play count of the scene is incremented.

By default, when a scene has a resume point, the scene player will automatically seek to this point when the scene is played. Setting "Always start video from beginning" to true disables this behaviour.

## Custom CSS

The stash UI can be customised using custom CSS. See [here](https://discourse.stashapp.cc/t/custom-css-snippets/4043) for a community-curated set of CSS snippets to customise your UI. 

There is also a [collection of community-created themes](https://discourse.stashapp.cc/tags/c/plugins/18/all/theme) available.

## Custom JavaScript

Stash supports the injection of custom JavaScript to assist with theming or adding additional functionality. Be aware that bad JavaScript could break the UI or worse.

## Custom locales

The localisation strings can be customised. The master list of default (en-GB) locale strings can be found [here](https://github.com/stashapp/stash/blob/develop/ui/v2.5/src/locales/en-GB.json). The custom locale format is the same as this json file.

For example, to override the `actions.add_directory` label (which is `Add directory` by default), you would have the following in the custom locale:

```
{
  "actions": {
    "add_directory": "Some other description"
  }
}
```

## Custom served folders

It is possible to expose specific folders to the UI. This configuration is performed manually in the `config.yml` file only.

Custom served content is exposed via the `/custom` URL path prefix.

For example, in the `config.yml` file:
```
custom_served_folders:
  /: D:\stash\static
  /foo: D:\bar
```

With the above configuration, a request for `/custom/foo/bar.png` would return `D:\bar\bar.png`. The `/` entry matches anything that is not otherwise mapped by the other entries. For example, `/custom/baz/xyz.png` would return `D:\stash\static\baz\xyz.png`.

Applications for this include using static images in custom css, like the Plex theme. For example, using the following config:
```yml
custom_served_folders:
  /: <stash folder>\custom
```

The `background.png` and `noise.png` files can be placed in the `custom` folder, then in the custom css, the `./background.png` and `./noise.png` strings can be replaced with `/custom/background.png` and `/custom/noise.png` respectively.

Other applications are to add custom UIs to stash, accessible via `/custom`.
