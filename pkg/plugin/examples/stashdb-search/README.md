## StashDB advanced search (PoC)

Stash's built-in stash-box integration only ever queries a scene by free text
(`searchScene`) or by file fingerprint (`findScenesBySceneFingerprints`) - see
`pkg/stashbox/scene.go`. Stash-box's own schema also exposes a richer
`queryScenes(input: SceneQueryInput!)` operation (filter by title, code, url,
date range, plus pagination/sort) that Stash never calls.

This plugin is a proof of concept: a UI page that calls `queryScenes`
directly against whichever stash-box instance you already have configured
under **Settings > Metadata Providers** (it reuses that endpoint and API key -
no separate settings screen needed for this PoC).

### What it filters on

- Title (contains)
- Code (with modifier: EQUALS / NOT_EQUALS / INCLUDES / EXCLUDES)
- URL (contains)
- Date (EQUALS / GREATER_THAN / LESS_THAN)
- Sort field + direction, per-page count

Studio/performer/tag filters exist on `SceneQueryInput` too (as ID-based
criteria) but are left out of this PoC to avoid building an ID-lookup UI for
a first pass.

### Build

```
cd pkg/plugin/examples/stashdb-search
npm install
npm run build
```

This produces `dist/stashdbSearch.js`, `dist/stashdbSearch.css` and
`dist/stashdbSearch.yml`. Copy the `dist` folder's contents into a
`plugins/stashdb-search/` directory under your Stash config directory (the
same place plugins normally live), then go to **Settings > Plugins**, click
"Reload Plugins", and enable it.

A new icon appears in the top nav bar linking to `/plugins/stashdb-search`.

### Why it needs a CSP entry

Stash serves a restrictive `Content-Security-Policy` by default. Plugin
manifests can extend it (`internal/api/server.go`), which is why
`stashdbSearch.yml` declares:

```yaml
ui:
  csp:
    connect-src:
      - https://stashdb.org
```

Without this, the browser blocks the plugin's `fetch()` call to
`stashdb.org` even though the request itself would otherwise succeed.
