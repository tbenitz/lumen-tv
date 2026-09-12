# Lumen TV

A polished public-stream IPTV viewer for GitHub Pages.

- 30 curated free lists (featured first, then iptv-org category and region playlists)
- Popular channels sorted to the top of each list
- Dual independent picture-in-picture windows you can drag and resize
- Separate volume and mute for main, PIP 1, and PIP 2
- Favorites, search, custom M3U URL, keyboard shortcuts

## Live site

After GitHub Pages is enabled this repo serves at:

`https://tbenitz.github.io/lumen-tv/`

## Enable GitHub Pages

1. Open **Settings → Pages**
2. Source: **GitHub Actions** (preferred) or **Deploy from a branch** → `main` / `/ (root)`
3. Wait a minute and open the Pages URL

## What this is — and is not

Lumen TV only points at **publicly listed live streams** (the [iptv-org](https://github.com/iptv-org/iptv) catalog plus a small featured set of official news / science / demo feeds).

It does **not** include paid cable packages, cracked playlists, or Xtream codes. Availability varies by network, geo, and whether a broadcaster allows browser playback (some streams work in VLC but block the web via CORS).

Use only streams you are allowed to watch in your country.

## Local preview

Any static server works:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause main |
| M | Mute main |
| 1 / 2 | Send current channel to PIP 1 / PIP 2 |
| F | Fullscreen theater |
| / | Focus channel search |
| Esc | Close a PIP |

## License

Site code is yours to use. Channel URLs belong to their broadcasters and to the iptv-org project (Unlicense). No video is hosted in this repository.
