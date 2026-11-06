<div align="center">

# 🍏 cider-vim

**Drive [Cider 2](https://cider.sh) with your keyboard. Vim motions, Vimium-style link hints, and a `:` command line.**

![Cider 2](https://img.shields.io/badge/Cider-2-ff5a5f?style=flat-square)
![pluginKit](https://img.shields.io/badge/pluginKit-v4-8fdc8f?style=flat-square)
![deps](https://img.shields.io/badge/dependencies-0-lightgrey?style=flat-square)
[![license: WTFPL](https://img.shields.io/badge/license-WTFPL-brightgreen?style=flat-square)](LICENSE)
![written by Claude](https://img.shields.io/badge/written%20by-Claude%20Sonnet%205.5-d97757?style=flat-square)

</div>

```
j/k scroll    f link hints    :vol 40    gg/G top/bottom    p play/pause    ? help
```

Stop reaching for the mouse. With cider-vim installed, Cider has a **NORMAL mode** whenever you aren't typing in a text field, and a small HUD in the corner tells you where you are (`NORMAL`, `-- INSERT --`, `HINT as`).

## Features

- **Vimium-style scrolling**: `j` `k` `d` `u` `gg` `G`, with counts (`5j`).
- **Link hints**: press `f`, then type the yellow label to click any visible link, button, tab, input or song row.
- **Row selection**: `J` `K` move a highlight through songs and cards, `Enter` plays or opens it.
- **Playback on the home row**: play/pause, next/prev, seek, volume, shuffle, repeat, favorite.
- **`:` command line**: `:vol 40`, `:seek 1:30`, `:go songs`, `:search daft punk`.
- **Page navigation**: `g` chords jump to library pages; `H` / `L` go back and forward; `gt` / `gT` switch tabs.
- **Stays out of the way**: modifier combos and keys it doesn't know fall through to Cider, so Space, `/` search and type-ahead keep working. Typing in a field is always left alone.
- Zero dependencies, one file.

## Install

Cider 2 loads plugins from `plugins/<identifier>/` inside its user data directory. On Linux that is:

```sh
git clone https://github.com/<you>/cider-vim
cd cider-vim
D=~/.config/sh.cider.genten/plugins/com.sx.cidervim
mkdir -p "$D" && cp plugin.js plugin.yml "$D"
```

Restart Cider. On other platforms, copy the same two files into the `plugins` folder of Cider's user data directory.

## Keys

### Scrolling and rows

| Keys | Action |
|---|---|
| `j` `k` | Scroll down / up a line (`5j` = five lines) |
| `d` `u` | Half page down / up |
| `gg` `G` | Top / bottom |
| `J` `K` | Move row selection down / up |
| `^d` `^u` | Move row selection by 10 |
| `Enter` | Play / open the selected row |
| `f` | Link hints. Type the label; `Backspace` undoes, `Esc` cancels |

### Playback

| Keys | Action |
|---|---|
| `p` | Play / pause |
| `n` `N` | Next / previous track |
| `h` `l` | Seek back / forward 5s (`6l` = 30s) |
| `+` `-` | Volume ±5% |
| `s` `r` | Shuffle, repeat |
| `*` | Favorite the current song |

### Navigation

| Keys | Action |
|---|---|
| `H` `L` | History back / forward |
| `gt` `gT` | Next / previous tab |
| `g` then `h` `s` `a` `r` `n` `l` `b` | Home, songs, albums, artists, recently added, listen now, browse |
| `/` | Search (Cider's own) |
| `Esc` | Leave a text field |
| `?` | Cheat sheet |

### Commands (`:`)

| Command | Does |
|---|---|
| `:vol 40` | Set volume, 0 to 100 |
| `:seek 90` · `:seek 1:30` · `:seek +10` · `:seek -10` | Seek to a time or by an offset |
| `:go home\|songs\|albums\|artists\|recent\|listen\|browse` | Open a page |
| `:search <text>` | Search |
| `:play` `:pause` `:next` `:prev` `:shuffle` `:repeat` | Playback |

Bad input shows a message in the HUD (for example `usage: vol 0-100`) until your next keypress.

## How it works

cider-vim is a Cider `pluginKitVersion: 4` plugin. It adds one capture-phase `keydown` listener on `window`, so it runs before Cider's own handler. It drives the app through the same internals Cider's UI uses:

- `window.__PLUGINSYS__.Stores.appleMusicStore`: playback (`playpause`, `skipToNext`, `seekTo`, `volume`, …)
- `window.CiderApp.PodRouter()`: page navigation, history and tabs
- plain DOM: scrolling, row highlighting and link hints

## Status

Early. Be aware before you rely on it:

- The logic is covered by a small smoke test with a stubbed DOM and player (`node test.mjs`). It does not exercise the real Cider UI.
- The row and clickable selectors came from reading Cider's source, not from a live page. Some pages may get missing or extra hints, or scroll the wrong container. Issues with the page name are welcome.
- It relies on Cider internals, so a Cider update can break it.

## Not included (yet)

Command history and completion, `F` (open link in a new tab), configurable keymaps, visual mode.

## Credits

This plugin was **written entirely by Claude** ([Claude Sonnet 5.5](https://www.anthropic.com/claude), model ID `claude-sonnet-5-5`) using [Claude Code](https://claude.com/claude-code), from the plugin API down to the tests and this README. The human supplied the idea and the direction.

## License

[WTFPL](LICENSE): do what the fuck you want to.
