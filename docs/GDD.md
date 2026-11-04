# Scripture Quest — Game Design Doc (v0.1, demo)

Working title: **Scripture Quest** (EN) / **La Búsqueda de la Palabra** (ES).
A retro 16×16 top-down adventure (Zelda-style, real-time) for **all ages**. The hero explores
**The Wilderness**, opens treasure chests to collect **10 famous Bible verses**, and gains
**6 abilities** inspired by God-given powers of famous biblical prophets and heroes. Ends with **1 boss** (the Giant).
Bilingual **English / Español**, switchable at any time. Retro synthesized sound.

Tech: plain HTML5 Canvas + vanilla JS ES modules. **No build step, no npm dependencies at runtime**
(GitHub Pages must serve it as static files). Target: desktop keyboard + mobile touch.

---------------------------------------------------------------------------------------------------
## 1. Repository layout & ownership (each agent ONLY writes its own files)

```
index.html, css/style.css, js/*.js (except js/audio.js)   → ENGINE agent
js/audio.js                                               → AUDIO agent
assets/sprites/**                                         → ART agent
data/verses.json, data/i18n.json                          → CONTENT agent
data/maps/wilderness.json, tools/validate_map.py          → MAPS agent
docs/GDD.md, README.md                                    → lead (do not edit)
```

## 2. The 6 abilities (fixed order of acquisition in the demo)

| # | id         | Source (theme)                  | Key verse theme | Mechanic | Gate it opens |
|---|------------|---------------------------------|-----------------|----------|---------------|
| 1 | `sling`    | David's Sling (1 Sam 17)        | courage         | Ranged stone projectile, 1 dmg, 0.35 s cooldown, travels 7 tiles in facing dir. | Lets you fight at all (starts near the camp) |
| 2 | `strength` | Samson's Strength (Judges 16)   | strength        | Smash: hits the tile directly in front. Destroys `boulder` tiles (→ sand). Also melee 3 dmg to enemy in front. 0.6 s cooldown. | Boulders block the canyon |
| 3 | `staff`    | Moses' Staff (Exodus 14)        | deliverance     | Raise staff facing water: every contiguous `water` tile in a straight line in facing direction (up to 10) and the 1 tile on each side of that line becomes `parted` (walkable sand with water walls) **permanently**. 1 s cooldown. | Lake/river crossing |
| 4 | `faith`    | Daniel's Faith (Daniel 6)       | trust           | Passive once owned: **lions** become peaceful (no contact damage, don't chase). Active: 3 s golden shield — invulnerable to all damage. 6 s cooldown. | The Lions' Den corridor (lions deal 2 hearts before you own it) |
| 5 | `fire`     | Elijah's Fire from Heaven (1 Kings 18) | God's power | Fire falls on the 3×3 area centered 3 tiles ahead: 2 dmg to enemies, burns `thorn` tiles (→ sand). 1.5 s cooldown. | Thorn hedge in front of the boss arena |
| 6 | `sun`      | Joshua's Sun Stands Still (Joshua 10) | God's sovereignty | Freezes all enemies, the boss and projectiles for 3 s (screen gets a warm golden tint). 8 s cooldown. | Boss: the Giant raises his shield; he only takes damage while frozen OR while his shield is down after a slam |

Controls (keyboard): Arrows/WASD move · **Space / J** = use equipped ability · **Q / K** = cycle equipped ability
· **E / Enter** = interact (talk, open chest, advance dialog) · **Esc / P** = pause menu (Verse Journal, language, sound, save & quit)
· **L** = toggle language EN/ES · **M** = mute.
Touch: on-screen D-pad (left) + buttons **A** (interact), **B** (ability), **⟳** (cycle), **☰** (menu). Shown only on touch devices.

## 3. Core rules
- Logical resolution **256×224** (16×14 tiles), integer-scaled to fit window, `image-rendering: pixelated`. Camera follows the hero, clamped to map.
- Hero: 3 hearts max at start (+1 per `heart` chest, max 6). Speed ~ 4.5 tiles/s. Invulnerable 1 s after a hit (blink).
- Hero death → "game over" screen → respawn at last **checkpoint** (camp start or the last opened ability chest) with full hearts; items/verses kept.
- Enemies: `serpent` (1 HP, slow wander, 1 dmg contact), `scorpion` (2 HP, wanders, charges when aligned, 1 dmg),
  `jackal` (2 HP, fast chase within 5 tiles, 1 dmg), `lion` (4 HP, chase within 6 tiles, 2 dmg; peaceful if hero owns `faith`).
  Defeated enemies vanish in a puff and may drop a small heart (20%). Enemies respawn when the map is re-entered from title.
- **Boss — the Giant** (32×32, 16 HP) in the arena. Pattern: walks toward hero → stomps (shockwave ring, 1 dmg) → throws spear (projectile, 1 dmg).
  Shield is up while walking (stones bounce). After a stomp, shield is down for 1.5 s. While frozen by `sun`, damage always counts.
  Defeat → victory scene: shows **1 Samuel 17:47** + verses collected X/10 + credits.
- Chests: `closed`/`open` sprite; open with interact when facing & adjacent. Contents: `verse`, `ability`, or `heart`.
  Opening a verse chest shows the **Verse Card** modal (golden border for `golden` rarity): reference + text in current language + translation tag.
- **Verse Journal** (menu): 10 slots, uncollected show `???` + chest hint; collected show full text, language-aware.
- Save: `localStorage` key `scripture-quest-save-v1` → `{lang, muted, hearts, maxHearts, abilities[], equipped, verses[], openedChests[], mapEdits[], checkpoint, bossDefeated}`. Autosave on chest open, checkpoint, and ability use that edits the map. Title screen: **Continue** (if save) / **New Game** / language.

## 4. Data contracts

### 4.1 `assets/sprites/spritesheet.json`
```json
{ "tileSize":16, "image":"spritesheet.png",
  "frames": { "<name>": {"x":0,"y":0,"w":16,"h":16,"category":"hero"} },
  "animations": { "<base>": ["<base>_0","<base>_1"] } }
```
Frame names REQUIRED (engine relies on them; engine draws a magenta placeholder if one is missing):
- Hero: `hero_{down,up,left,right}_{0,1}`
- NPC: `npc_prophet`
- Items: `chest_closed`, `chest_open`, `item_verse_scroll`, `item_verse_scroll_gold`, `item_heart`, `ui_heart_full`, `ui_heart_empty`
- Ability icons (16×16, used in HUD + chest reveal): `icon_sling`, `icon_strength`, `icon_staff`, `icon_faith`, `icon_fire`, `icon_sun`
- FX: `fx_sling_stone` (stone drawn centered, ~6px), `fx_fire_elijah_{0,1}`, `fx_shield_{0,1}` (translucent-look golden ring around hero, 16×16 overlay), `fx_puff_{0,1}`, `fx_smash_{0,1}`, `fx_spear` (horizontal; engine rotates by 90° steps), `fx_shockwave_{0,1}`
- Enemies: `enemy_serpent_{0,1}`, `enemy_scorpion_{0,1}`, `enemy_jackal_{0,1}`, `enemy_lion_{0,1}`
- Boss (32×32): `boss_giant_{0,1}` (walking, shield up), `boss_giant_stomp`, `boss_giant_hurt`
- Tiles: `tile_grass`, `tile_sand`, `tile_path`, `tile_water_{0,1}`, `tile_parted_sea_{0,1}`, `tile_stone_wall`, `tile_palm`, `tile_rock`, `tile_boulder` (cracked, smashable), `tile_thorn` (burnable), `tile_tent`, `tile_den_floor` (darker stone floor for Lions' Den), `tile_arena_floor`
- Title: `title_logo` may be any size (optional; engine falls back to text).

### 4.2 `data/maps/wilderness.json`
```json
{
  "id": "wilderness", "name": {"en":"The Wilderness","es":"El Desierto"},
  "width": 64, "height": 48,
  "legend": { ".":"grass", ",":"sand", "=":"path", "~":"water", "#":"stone_wall", "T":"palm",
              "r":"rock", "o":"boulder", "*":"thorn", "A":"tent", "d":"den_floor", "a":"arena_floor" },
  "rows": ["<width chars>", "... height rows ..."],
  "playerStart": {"x":5, "y":6},
  "checkpoints": [{"id":"camp","x":5,"y":6}],
  "chests": [
    {"id":"c_sling", "x":7,"y":4, "contains":{"type":"ability","ability":"sling"}},
    {"id":"c_v1",    "x":..,"y":.., "contains":{"type":"verse","verseId":"psalm-23-1"}},
    {"id":"c_h1",    "x":..,"y":.., "contains":{"type":"heart"}}
  ],
  "npcs": [{"id":"elder","sprite":"npc_prophet","x":4,"y":4,"dialog":["dialog.elder_1","dialog.elder_2","dialog.elder_3"]}],
  "signs": [{"x":..,"y":..,"text":"sign.canyon"}],
  "enemies": [{"type":"serpent","x":..,"y":..}],
  "boss": {"type":"giant","x":..,"y":..,"arena":{"x":..,"y":..,"w":..,"h":..}}
}
```
Tile walkability: walkable = grass, sand, path, parted, den_floor, arena_floor. Solid = water, stone_wall, palm, rock, boulder, thorn, tent. Chests and NPCs are solid.
Coordinates are tile coords (0-based, x = column, y = row).

### 4.3 `data/verses.json`
```json
{ "translations": {
    "en": {"default":"kjv", "kjv": {"name":"King James Version","credit":"Scripture quotations from the King James Version (public domain)."}},
    "es": {"default":"ntv", "fallback":"rv1909",
           "ntv": {"name":"Nueva Traducción Viviente","credit":"El texto bíblico indicado con «NTV» ha sido tomado de la Santa Biblia, Nueva Traducción Viviente, © Tyndale House Foundation, 2010. Usado con permiso de Tyndale House Publishers, Inc., 351 Executive Dr., Carol Stream, IL 60188, Estados Unidos de América. Todos los derechos reservados."},
           "rv1909": {"name":"Reina-Valera 1909","credit":"Reina-Valera 1909 (dominio público)."}} },
  "verses": [
    { "id":"john-3-16", "rarity":"golden",
      "ref":{"en":"John 3:16","es":"Juan 3:16"},
      "text":{"kjv":"...", "rv1909":"...", "ntv":null},
      "theme":{"en":"God's love","es":"El amor de Dios"},
      "hint":{"en":"Hidden near the camp","es":"..."} }
  ],
  "victoryVerse": { "id":"1-samuel-17-47", ...same shape... } }
```
Spanish shows `ntv` if non-null, else `rv1909`, with the translation tag (NTV / RVR1909). English shows `kjv` with tag KJV.

The 10 chest verses (ids are fixed — maps and engine use them):
`exodus-14-14` (Moses), `psalm-23-1`, `psalm-119-105` (golden), `proverbs-3-5`, `joshua-1-9`, `isaiah-40-31`,
`jeremiah-29-11`, `john-3-16` (golden), `romans-8-28`, `philippians-4-13`.  Victory verse: `1-samuel-17-47`.

### 4.4 `data/i18n.json`
`{ "en": {"key":"text"}, "es": {"key":"text"} }` — engine calls `t(key, vars)`; `{name}` placeholders. Missing key → shows the key.
Required keys:
- UI: `ui.title`, `ui.subtitle`, `ui.press_start`, `ui.continue`, `ui.new_game`, `ui.language`, `ui.sound_on`, `ui.sound_off`, `ui.journal`, `ui.resume`, `ui.save_quit`, `ui.verses_count` (`{n}/{total}`), `ui.unknown_verse`, `ui.hint`, `ui.game_over`, `ui.try_again`, `ui.victory`, `ui.victory_msg`, `ui.credits`, `ui.credits_body`, `ui.got_verse`, `ui.got_heart`, `ui.got_ability`, `ui.equipped`, `ui.press_interact`, `ui.controls_keyboard`, `ui.controls_touch`, `ui.checkpoint`, `ui.boss_name`
- Abilities: `ability.<id>.name`, `ability.<id>.desc`, `ability.<id>.ref` (e.g. "1 Samuel 17") for the 6 ids.
- Dialog: `dialog.elder_1` … `dialog.elder_6` (intro: welcome, the scrolls are hidden in chests across the Wilderness, take David's sling in the chest, God gave the prophets power by faith — use it to help, the Giant guards the far end), `dialog.elder_after` (repeat line after intro).
- Signs: `sign.camp`, `sign.canyon` (boulders), `sign.sea` (water), `sign.den` (lions), `sign.thorns`, `sign.arena` (the Giant).
- Tutorial toasts: `tip.<ability id>` (one per ability, e.g. "Face a cracked boulder and press Space").

## 5. Region layout — The Wilderness (64×48)
Critical path, west→east / north→south, each zone gated by the previous ability:
1. **Camp** (NW): tents, elder, `c_sling` chest, 1 verse chest. Grass/path. A few serpents just outside.
2. **Canyon** (N-center): rocky walls; path blocked by `boulder`s. `c_strength` chest reachable before the boulders (guarded by scorpions). 2 verses beyond.
3. **Red Sea Shore** (NE): wide water band (≥3 tiles thick) cutting the map; `c_staff` on this side. Crossing leads south-east. 1 verse + heart on an islet reachable only by parting.
4. **Lions' Den** (E/SE): den_floor corridor with 3–4 lions; `c_faith` sits at the den entrance; 1 verse inside the den.
5. **Mount Carmel** (S): `c_fire` chest; jackals; thorn hedges hide 2 verses + 1 heart.
6. **Valley of Aijalon / Arena** (SW): `c_sun` chest just before the arena; thorn hedge (needs fire) blocks the arena entrance. Boss arena ~14×10 of `arena_floor`.
Total: 10 verse chests, 6 ability chests, 2 heart chests. Every verse must be reachable with the abilities available by the time the player gets there (validator checks this).

## 6. Audio (js/audio.js API, WebAudio synth only — no audio files)
```js
export const Audio = {
  init(),                 // call on first user gesture; safe to call repeatedly
  setMuted(bool), isMuted(),
  sfx(name),              // names below; unknown names ignored
  music(trackName|null),  // 'title' | 'overworld' | 'den' | 'boss' | 'victory' | null (stop); loops except 'victory'
};
```
SFX names: `step` (quiet, optional), `chest_open`, `verse_get` (jingle), `ability_get` (fanfare), `heart_get`, `hit_enemy`, `enemy_die`, `hero_hurt`,
`hero_die`, `sling`, `smash`, `staff_part`, `shield`, `fire`, `sun`, `menu_move`, `menu_select`, `dialog_blip`, `boss_stomp`, `boss_spear`, `boss_hurt`, `boss_die`, `checkpoint`, `error`.

## 7. Engine debug/test hooks (for QA)
`window.__game` exposes: `state` (scene, player {x,y,hearts,maxHearts}, abilities, equipped, verses, openedChests, bossHp),
`teleport(tx,ty)`, `give(abilityId)`, `openChest(id)`, `setScene(name)`, `step(ms)` (advance simulation deterministically when `?test=1` pauses the RAF loop), `press(key, ms)`.
URL flags: `?debug=1` (draw collision grid + FPS), `?test=1` (manual stepping), `?lang=es`, `?nosave=1`.

## 8. Credits screen text must include
Game design & code: Scripture Quest team · KJV credit · NTV credit (verbatim above) · RV1909 credit.
