# Scripture Quest · La Búsqueda de la Palabra

A retro 16×16 top-down adventure for all ages. Explore **The Wilderness**, open treasure chests to collect
**10 famous Bible verses**, and gain **6 God-given abilities** inspired by biblical prophets and heroes, then face the **Giant**.
Play in **English (KJV)** or **Español**.

| Ability | Inspired by | What it does |
|---|---|---|
| Sling | David (1 Samuel 17) | Throw stones at enemies |
| Strength | Samson (Judges 16) | Smash cracked boulders |
| Staff | Moses (Exodus 14) | Part the waters |
| Faith | Daniel (Daniel 6) | Lions become peaceful, plus a golden shield |
| Fire | Elijah (1 Kings 18) | Fire from heaven burns thorns and enemies |
| Sun | Joshua (Joshua 10) | The sun stands still and enemies freeze |

## Controls
**Keyboard:**

| Key | Action |
|---|---|
| Arrows / WASD | Move |
| Space / J | Use ability |
| Q / K | Switch ability |
| E / Enter | Talk / open |
| Esc / P | Menu and Verse Journal |
| L | Switch language |
| M | Mute |

**Touch:** an on-screen D-pad plus these buttons:

| Button | Action |
|---|---|
| A | Talk / open |
| B | Use ability |
| ⟳ | Switch ability |
| ☰ | Menu |

## Play locally
The game is plain HTML, CSS and JavaScript with no build step and no dependencies. It must be served over HTTP (it won't work from `file://`):
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
URL flags:

| Flag | Effect |
|---|---|
| `?lang=es` | Start in Spanish |
| `?nosave=1` | Don't save progress |
| `?debug=1` | Show collision grid and FPS |
| `?test=1` | Manual stepping for automated tests |

## Publish on GitHub Pages
1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment**. Set Source to *Deploy from a branch* and Branch to `main` / `(root)`, then click **Save**.
3. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

## Adding the NTV Spanish text
Spanish verses currently show the **Reina-Valera 1909**, which is public domain. To switch to the **Nueva Traducción Viviente**, open `data/verses.json` and paste the exact NTV text into each verse's `"ntv"` field (currently `null`). The game then shows NTV automatically, and the required Tyndale credit line is already on the credits screen.
Tyndale allows quoting up to 500 NTV verses without written permission, as long as the verses are under 25% of the work and that credit line is shown. Commercial use needs written permission from Tyndale (permisos@tyndale.com).

## Project layout
| Path | Contents |
|---|---|
| `index.html`, `css/`, `js/` | Game engine: scenes, entities, abilities, UI, save, bitmap font |
| `js/audio.js` | Synthesized chiptune music and sound effects (WebAudio, no audio files) |
| `assets/sprites/` | Spritesheet and atlas; `src/make_sprites.py` regenerates all art |
| `data/maps/wilderness.json` | The region map (64×48) |
| `data/verses.json` | Verses (KJV / RV1909 / NTV slot) |
| `data/i18n.json` | All game text in English and Spanish |
| `docs/GDD.md` | Game design doc and data contracts |
| `tools/` | Map validator, engine test suite, audio test page |

Tests (need Python 3, Pillow, Playwright and Chrome):
```bash
python3 tools/validate_map.py      # checks the map can be completed in the right order
python3 tools/test_engine.py       # end-to-end browser test
```

## Credits
- Scripture quotations from the King James Version (public domain).
- Reina-Valera 1909 (public domain).
- El texto bíblico indicado con «NTV» ha sido tomado de la Santa Biblia, Nueva Traducción Viviente, © Tyndale House Foundation, 2010. Usado con permiso de Tyndale House Publishers, Inc. Todos los derechos reservados.
- The title music uses the hymn tune OLD HUNDREDTH (Genevan Psalter, 1551, public domain). All other music, art and code are original.
