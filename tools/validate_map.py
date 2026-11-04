#!/usr/bin/env python3
"""Validate data/maps/wilderness.json against GDD sections 2-5 and render docs/map_preview.png.

Usage:  python3 tools/validate_map.py [map.json] [--no-png] [--png out.png]
Exit code 0 = all checks pass, 1 = failures.

Progression model
  * walkable: grass sand path parted den_floor arena_floor; chests / NPCs / signs block.
  * strength -> boulder tiles passable (smash the tile in front).
  * staff    -> EXACT simulation of the GDD parting rule: from any reachable tile facing water,
                contiguous water in a straight line (max 10) + 1 tile each side becomes `parted`.
                Repeated to a fixpoint, so every crossing used is straight and <= 10 per cast.
  * fire     -> thorn tiles passable.
  * sun      -> arena_floor impassable until sun is owned (engine rule).
  * faith    -> SOFT gate: den_floor is treated as impassable without faith (lions deal 2 hearts
                and chase); this is how the den is modelled as a gate.
  * sling    -> SOFT gate (combat only): not modelled physically; c_strength is reported as
                reachable from the start (it is guarded by scorpions).
"""
import json, os, sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGEND = {".": "grass", ",": "sand", "=": "path", "~": "water", "#": "stone_wall", "T": "palm",
          "r": "rock", "o": "boulder", "*": "thorn", "A": "tent", "d": "den_floor", "a": "arena_floor"}
WALKABLE = {"grass", "sand", "path", "parted", "den_floor", "arena_floor"}
SOLID = {"water", "stone_wall", "palm", "rock", "boulder", "thorn", "tent"}
ORDER = ["sling", "strength", "staff", "faith", "fire", "sun"]
SOFT = {"sling"}          # abilities whose gate is combat-only (no tile effect, not modelled)
VERSES = {"exodus-14-14", "psalm-23-1", "psalm-119-105", "proverbs-3-5", "joshua-1-9", "isaiah-40-31",
          "jeremiah-29-11", "john-3-16", "romans-8-28", "philippians-4-13"}
SIGNS = {"sign.camp", "sign.canyon", "sign.sea", "sign.den", "sign.thorns", "sign.arena"}
ENEMY_TYPES = {"serpent", "scorpion", "jackal", "lion"}
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
PART_MAX = 10

errors, warnings = [], []
def err(m): errors.append(m)
def warn(m): warnings.append(m)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_static(m):
    W, H = m.get("width"), m.get("height")
    if (W, H) != (64, 48): err(f"dimensions {W}x{H}, expected 64x48")
    if m.get("id") != "wilderness": err("id must be 'wilderness'")
    if m.get("legend") != LEGEND: err("legend differs from GDD 4.2")
    rows = m.get("rows", [])
    if len(rows) != H: err(f"{len(rows)} rows, expected {H}")
    for y, r in enumerate(rows):
        if len(r) != W: err(f"row {y} has length {len(r)}")
        for x, c in enumerate(r):
            if c not in LEGEND: err(f"unknown char {c!r} at {x},{y}")
    if errors: return False
    tile = lambda x, y: LEGEND[rows[y][x]]
    # solid border
    for x in range(W):
        for y in (0, H - 1):
            if tile(x, y) not in SOLID: err(f"border tile not solid at {x},{y}")
    for y in range(H):
        for x in (0, W - 1):
            if tile(x, y) not in SOLID: err(f"border tile not solid at {x},{y}")
    # ids
    ids = {}
    for kind in ("chests", "npcs", "checkpoints"):
        for o in m.get(kind, []):
            if o["id"] in ids: err(f"duplicate id {o['id']}")
            ids[o["id"]] = kind
    # positions
    occupied = {}
    def occ(o, what):
        p = (o["x"], o["y"])
        if not (0 <= p[0] < W and 0 <= p[1] < H): err(f"{what} out of bounds {p}"); return
        if p in occupied: err(f"{what} at {p} overlaps {occupied[p]}")
        occupied[p] = what
    for c in m["chests"]: occ(c, c["id"])
    for n in m["npcs"]: occ(n, n["id"])
    for s in m["signs"]: occ(s, s["text"])
    for e in m["enemies"]: occ(e, "enemy " + e["type"])
    b = m["boss"]
    bossTiles = [(b["x"] + dx, b["y"] + dy) for dx in (0, 1) for dy in (0, 1)]
    for p in bossTiles:
        if p in occupied: err(f"boss overlaps {occupied[p]}")
    blockers = {(o["x"], o["y"]) for o in m["chests"] + m["npcs"] + m["signs"]}
    for o, what in [(c, c["id"]) for c in m["chests"]] + [(n, n["id"]) for n in m["npcs"]] + \
                   [(s, s["text"]) for s in m["signs"]] + [(e, "enemy") for e in m["enemies"]] + \
                   [(c, "checkpoint " + c["id"]) for c in m["checkpoints"]] + [(m["playerStart"], "playerStart")]:
        if tile(o["x"], o["y"]) not in WALKABLE: err(f"{what} at {o['x']},{o['y']} sits on {tile(o['x'], o['y'])}")
    for o, what in [(m["playerStart"], "playerStart")] + [(c, "checkpoint " + c["id"]) for c in m["checkpoints"]]:
        if (o["x"], o["y"]) in blockers: err(f"{what} on a blocking object")
    # adjacency
    def adj_walk(x, y):
        return [(x + dx, y + dy) for dx, dy in DIRS if tile(x + dx, y + dy) in WALKABLE and (x + dx, y + dy) not in blockers]
    for o, what in [(c, c["id"]) for c in m["chests"]] + [(n, n["id"]) for n in m["npcs"]] + [(s, s["text"]) for s in m["signs"]]:
        if not adj_walk(o["x"], o["y"]): err(f"{what} has no adjacent walkable tile")
    # contents
    ab = [c["contains"].get("ability") for c in m["chests"] if c["contains"]["type"] == "ability"]
    if sorted(ab) != sorted(ORDER): err(f"ability chests {ab}")
    for c in m["chests"]:
        if c["contains"]["type"] == "ability" and c["id"] != "c_" + c["contains"]["ability"]:
            err(f"ability chest id {c['id']} should be c_{c['contains']['ability']}")
    vs = [c["contains"].get("verseId") for c in m["chests"] if c["contains"]["type"] == "verse"]
    if len(vs) != 10 or set(vs) != VERSES: err(f"verse chests wrong: {vs}")
    hearts = [c for c in m["chests"] if c["contains"]["type"] == "heart"]
    if len(hearts) != 2: err(f"{len(hearts)} heart chests, expected 2")
    if len(m["chests"]) != 18: err(f"{len(m['chests'])} chests, expected 18")
    # npc / signs
    elder = [n for n in m["npcs"] if n["id"] == "elder"]
    if not elder: err("no elder NPC")
    elif elder[0]["dialog"] != [f"dialog.elder_{i}" for i in range(1, 7)]: err("elder dialog keys")
    if {s["text"] for s in m["signs"]} != SIGNS: err("signs set differs")
    # checkpoints
    cps = {c["id"]: c for c in m["checkpoints"]}
    if "camp" not in cps: err("no camp checkpoint")
    elif (cps["camp"]["x"], cps["camp"]["y"]) != (m["playerStart"]["x"], m["playerStart"]["y"]):
        warn("camp checkpoint differs from playerStart")
    chests = {c["id"]: c for c in m["chests"]}
    for a in ORDER:
        cp = cps.get("cp_" + a)
        ch = chests.get("c_" + a)
        if not cp: err(f"missing checkpoint cp_{a}"); continue
        if ch and abs(cp["x"] - ch["x"]) + abs(cp["y"] - ch["y"]) != 1:
            err(f"cp_{a} not directly in front of c_{a}")
    # enemies
    safe = [(m["playerStart"]["x"], m["playerStart"]["y"])] + [(c["x"], c["y"]) for c in m["checkpoints"]]
    for e in m["enemies"]:
        if e["type"] not in ENEMY_TYPES: err(f"bad enemy type {e['type']}")
        for sx, sy in safe:
            if max(abs(e["x"] - sx), abs(e["y"] - sy)) <= 4:
                err(f"{e['type']} at {e['x']},{e['y']} within 4 tiles of start/checkpoint {sx},{sy}")
                break
    # boss / arena
    ar = b["arena"]
    for p in bossTiles:
        if not (ar["x"] <= p[0] < ar["x"] + ar["w"] and ar["y"] <= p[1] < ar["y"] + ar["h"]):
            err("boss outside arena rect")
        elif tile(*p) != "arena_floor": err(f"boss tile {p} not arena_floor")
    bad = [(x, y) for x in range(ar["x"], ar["x"] + ar["w"]) for y in range(ar["y"], ar["y"] + ar["h"]) if tile(x, y) != "arena_floor"]
    if bad: warn(f"{len(bad)} non-arena_floor tiles inside arena rect")
    return True


class Sim:
    def __init__(self, m):
        self.m, self.W, self.H = m, m["width"], m["height"]
        self.base = [[LEGEND[c] for c in r] for r in m["rows"]]
        self.blockers = {(o["x"], o["y"]) for o in m["chests"] + m["npcs"] + m["signs"]}

    def reach(self, abil):
        g = [r[:] for r in self.base]
        partings = []

        def passable(x, y):
            if (x, y) in self.blockers: return False
            t = g[y][x]
            if t in ("grass", "sand", "path", "parted"): return True
            if t == "arena_floor": return "sun" in abil   # engine blocks the arena until sun is owned
            if t == "den_floor": return "faith" in abil
            if t == "boulder": return "strength" in abil
            if t == "thorn": return "fire" in abil
            return False

        s = (self.m["playerStart"]["x"], self.m["playerStart"]["y"])
        seen = {s}
        while True:
            q = deque(seen)
            while q:
                x, y = q.popleft()
                for dx, dy in DIRS:
                    n = (x + dx, y + dy)
                    if n not in seen and 0 <= n[0] < self.W and 0 <= n[1] < self.H and passable(*n):
                        seen.add(n); q.append(n)
            if "staff" not in abil: break
            changed = False
            for (x, y) in list(seen):
                for dx, dy in DIRS:
                    cx, cy, k, line = x + dx, y + dy, 0, []
                    while k < PART_MAX and 0 <= cx < self.W and 0 <= cy < self.H and g[cy][cx] == "water":
                        line.append((cx, cy)); cx += dx; cy += dy; k += 1
                    if not line: continue
                    for lx, ly in line:
                        for sx, sy in ((lx, ly), (lx + dy, ly + dx), (lx - dy, ly - dx)):
                            if 0 <= sx < self.W and 0 <= sy < self.H and g[sy][sx] == "water":
                                g[sy][sx] = "parted"; changed = True
                    partings.append(((x, y), (dx, dy), len(line)))
            if not changed: break
        return seen, g, partings

    def chest_reachable(self, seen, c):
        return any((c["x"] + dx, c["y"] + dy) in seen for dx, dy in DIRS)


def check_progression(m, log):
    sim = Sim(m)
    chests = {c["id"]: c for c in m["chests"]}
    owned, got_at = [], {}
    for k, a in enumerate(ORDER):
        seen, _, parts = sim.reach(set(owned))
        stage = "{" + ",".join(owned) + "}"
        for c in m["chests"]:
            if c["contains"]["type"] != "ability" and c["id"] not in got_at and sim.chest_reachable(seen, c):
                got_at[c["id"]] = stage
        if not sim.chest_reachable(seen, chests["c_" + a]):
            err(f"c_{a} NOT reachable with {stage}"); return
        for later in ORDER[k + 1:]:
            if sim.chest_reachable(seen, chests["c_" + later]):
                if ORDER[k] in SOFT:   # gate before `later` is combat-only (sling)
                    warn(f"c_{later} reachable with {stage} (soft gate: needs combat with {a})")
                else:
                    err(f"c_{later} reachable too early with {stage}")
        log.append(f"  {stage:38s} -> c_{a} reachable; {len(seen)} tiles")
        owned.append(a)
    seen, g, parts = sim.reach(set(owned))
    for c in m["chests"]:
        if c["contains"]["type"] != "ability" and c["id"] not in got_at and sim.chest_reachable(seen, c):
            got_at[c["id"]] = "{all}"
    for c in m["chests"]:
        if c["contains"]["type"] != "ability":
            if c["id"] not in got_at: err(f"{c['id']} never reachable")
            else:
                what = c["contains"].get("verseId", "heart")
                log.append(f"  {c['id']:6s} ({c['x']:2d},{c['y']:2d}) {what:17s} first reachable with {got_at[c['id']]}")
    # staff-only chest check: exodus must need staff
    for c in m["chests"]:
        if c["contains"].get("verseId") == "exodus-14-14":
            s2, _, _ = sim.reach({"sling", "strength", "faith", "fire", "sun"})
            if sim.chest_reachable(s2, c): err("exodus-14-14 islet reachable without staff")
    # arena unreachable without fire, reachable with all
    b = m["boss"]; ar = b["arena"]
    arena = {(x, y) for x in range(ar["x"], ar["x"] + ar["w"]) for y in range(ar["y"], ar["y"] + ar["h"])}
    nofire, _, _ = sim.reach(set(ORDER) - {"fire"})
    if arena & nofire: err("arena reachable WITHOUT fire")
    nosun, _, _ = sim.reach(set(ORDER) - {"sun"})
    if arena & nosun: err("arena reachable WITHOUT sun")
    # boss must be >= 5 tiles from every arena entry tile (walkable tile outside the rect touching it)
    entries = [(x, y) for (x, y) in seen if (x, y) not in arena and any((x + dx, y + dy) in arena for dx, dy in DIRS)]
    for ex, ey in entries:
        dmin = min(abs(ex - bx) + abs(ey - by) for bx in (b["x"], b["x"] + 1) for by in (b["y"], b["y"] + 1))
        if dmin < 5: err(f"boss only {dmin} tiles from arena entrance {ex},{ey}")
    log.append(f"  arena entrances {sorted(entries)}; boss top-left {b['x']},{b['y']}")
    if (b["x"], b["y"]) not in seen and not (arena & seen): err("arena not reachable with all abilities")
    # NPCs/signs reachable at the end
    for o in m["npcs"] + m["signs"]:
        if not sim.chest_reachable(seen, o): err(f"{o.get('id', o.get('text'))} not reachable")
    for e in m["enemies"]:
        if (e["x"], e["y"]) not in seen: warn(f"{e['type']} at {e['x']},{e['y']} is on an unreachable tile")
    # crossings actually needed
    useful = [p for p in parts if p[2] >= 1]
    lens = sorted({p[2] for p in useful})
    log.append(f"  staff casts possible from reachable tiles: {len(useful)}; line lengths seen {lens} (max {PART_MAX})")
    return sim, g


# ------------------------------------------------------------------ rendering
COLORS = {"grass": (92, 168, 72), "sand": (226, 202, 140), "path": (196, 160, 104), "water": (52, 104, 200),
          "stone_wall": (96, 92, 100), "palm": (36, 110, 52), "rock": (140, 128, 116), "boulder": (168, 108, 60),
          "thorn": (128, 40, 120), "tent": (232, 232, 220), "den_floor": (84, 64, 60), "arena_floor": (176, 136, 96),
          "parted": (236, 224, 180)}
MARK = {"ability": (255, 210, 0), "verse": (255, 255, 255), "heart": (232, 32, 48),
        "serpent": (40, 255, 120), "scorpion": (255, 120, 0), "jackal": (150, 80, 30), "lion": (255, 160, 40)}


def render(m, out):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        warn("Pillow not installed; skipping PNG"); return
    S = 8
    W, H = m["width"], m["height"]
    panel = 230
    img = Image.new("RGB", (W * S + panel, max(H * S, 560)), (24, 22, 30))
    d = ImageDraw.Draw(img)
    for y, r in enumerate(m["rows"]):
        for x, c in enumerate(r):
            t = LEGEND[c]
            d.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=COLORS[t])
            if t == "palm": d.ellipse([x * S + 1, y * S + 1, x * S + 6, y * S + 6], fill=(20, 70, 30))
            if t == "boulder": d.line([x * S + 2, y * S + 2, x * S + 5, y * S + 5], fill=(60, 30, 10))
            if t == "thorn": d.line([x * S + 1, y * S + 6, x * S + 6, y * S + 1], fill=(220, 120, 220))
            if t == "tent": d.polygon([(x * S + 4, y * S + 1), (x * S + 7, y * S + 7), (x * S, y * S + 7)], fill=(190, 60, 40))
    ar = m["boss"]["arena"]
    d.rectangle([ar["x"] * S, ar["y"] * S, (ar["x"] + ar["w"]) * S - 1, (ar["y"] + ar["h"]) * S - 1], outline=(255, 60, 60))
    b = m["boss"]
    d.rectangle([b["x"] * S + 1, b["y"] * S + 1, b["x"] * S + 2 * S - 2, b["y"] * S + 2 * S - 2], fill=(200, 0, 0), outline=(0, 0, 0))
    for c in m["checkpoints"]:
        d.rectangle([c["x"] * S, c["y"] * S, c["x"] * S + S - 1, c["y"] * S + S - 1], outline=(0, 255, 255))
    for c in m["chests"]:
        col = MARK[c["contains"]["type"]]
        d.rectangle([c["x"] * S, c["y"] * S, c["x"] * S + S - 1, c["y"] * S + S - 1], fill=col, outline=(0, 0, 0))
        d.rectangle([c["x"] * S, c["y"] * S + 3, c["x"] * S + S - 1, c["y"] * S + 3], fill=(90, 50, 20))
    for e in m["enemies"]:
        d.ellipse([e["x"] * S + 1, e["y"] * S + 1, e["x"] * S + 6, e["y"] * S + 6], fill=MARK[e["type"]], outline=(0, 0, 0))
    for n in m["npcs"]:
        d.rectangle([n["x"] * S + 1, n["y"] * S, n["x"] * S + 6, n["y"] * S + 7], fill=(255, 0, 255), outline=(0, 0, 0))
    for s in m["signs"]:
        d.rectangle([s["x"] * S + 1, s["y"] * S + 1, s["x"] * S + 6, s["y"] * S + 5], fill=(120, 72, 24), outline=(250, 230, 160))
    p = m["playerStart"]
    d.polygon([(p["x"] * S + 4, p["y"] * S), (p["x"] * S + 8, p["y"] * S + 8), (p["x"] * S, p["y"] * S + 8)], fill=(255, 255, 255), outline=(0, 0, 0))
    # legend panel
    X0 = W * S + 8; yy = 4
    d.text((X0, yy), "Scripture Quest - The Wilderness", fill=(255, 255, 255)); yy += 14
    for name in ["grass", "sand", "path", "water", "stone_wall", "palm", "rock", "boulder", "thorn", "tent", "den_floor", "arena_floor"]:
        d.rectangle([X0, yy + 1, X0 + 7, yy + 8], fill=COLORS[name]); d.text((X0 + 12, yy), name, fill=(220, 220, 220)); yy += 11
    yy += 3
    for label, col in [("ability chest", MARK["ability"]), ("verse chest", MARK["verse"]), ("heart chest", MARK["heart"])]:
        d.rectangle([X0, yy + 1, X0 + 7, yy + 8], fill=col, outline=(0, 0, 0)); d.text((X0 + 12, yy), label, fill=(220, 220, 220)); yy += 11
    for label in ["serpent", "scorpion", "jackal", "lion"]:
        d.ellipse([X0, yy + 1, X0 + 7, yy + 8], fill=MARK[label]); d.text((X0 + 12, yy), label, fill=(220, 220, 220)); yy += 11
    for label, col in [("elder NPC", (255, 0, 255)), ("sign", (120, 72, 24)), ("boss / arena", (200, 0, 0))]:
        d.rectangle([X0, yy + 1, X0 + 7, yy + 8], fill=col); d.text((X0 + 12, yy), label, fill=(220, 220, 220)); yy += 11
    d.rectangle([X0, yy + 1, X0 + 7, yy + 8], outline=(0, 255, 255)); d.text((X0 + 12, yy), "checkpoint", fill=(220, 220, 220)); yy += 11
    d.polygon([(X0 + 4, yy), (X0 + 8, yy + 8), (X0, yy + 8)], fill=(255, 255, 255)); d.text((X0 + 12, yy), "player start", fill=(220, 220, 220)); yy += 15
    for c in m["chests"]:
        t = c["contains"]
        what = t.get("ability") or t.get("verseId") or "heart"
        d.text((X0, yy), f"{c['id']:<10} {c['x']:>2},{c['y']:<2} {what}", fill=(200, 200, 160)); yy += 10
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)


def main():
    args = sys.argv[1:]
    path = next((a for a in args if a.endswith(".json")), os.path.join(ROOT, "data/maps/wilderness.json"))
    png = os.path.join(ROOT, "docs/map_preview.png")
    if "--png" in args: png = args[args.index("--png") + 1]
    m = load(path)
    log = []
    if check_static(m):
        check_progression(m, log)
        if "--no-png" not in args: render(m, png)
    from collections import Counter
    cnt = Counter(e["type"] for e in m.get("enemies", []))
    print("Progression:"); print("\n".join(log))
    print(f"Enemies: {sum(cnt.values())} {dict(cnt)}")
    for w in warnings: print("WARN:", w)
    for e in errors: print("FAIL:", e)
    print("RESULT:", "PASS" if not errors else f"FAIL ({len(errors)} errors)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
