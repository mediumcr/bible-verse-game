#!/usr/bin/env python3
"""Engine QA for Scripture Quest (headless Chrome via Playwright).

Usage:  python3 tools/test_engine.py [--fixtures] [--shots /tmp/sq]
Serves the repo with python3 -m http.server on a free port and drives window.__game
(GDD section 7 hooks). Exits non-zero if any check fails.
"""
import argparse, json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/usr/bin/google-chrome'

results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))
    return cond


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


# JS helpers injected into the page -------------------------------------------------
HELPERS = r"""
window.__qa = {
  g: () => __game.game,
  walk(x, y) { return __game.game.world.isWalkable(x, y) && !__game.game.occupied(x, y); },
  // find a tile from which the hero faces (tx,ty) at distance d, returns {x,y,dir}
  standFor(tx, ty, d = 1) {
    const dirs = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
    for (const [dir, [dx, dy]] of Object.entries(dirs)) {
      const x = tx + dx * d, y = ty + dy * d;
      if (this.walk(x, y)) return { x, y, dir };
    }
    return null;
  },
  findTiles(name) {
    const w = __game.game.world, out = [];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.get(x, y) === name) out.push({ x, y });
    return out;
  },
  face(dir) { __game.game.hero.dir = dir; },
  freezeEnemy(e) { e.vx = 0; e.vy = 0; e.t = 99; e.state = 'wander'; e.kb = null; },
  placeEnemy(type, x, y) {
    const e = __game.game.enemies.find((e) => e.type === type && e.alive);
    if (!e) return false;
    e.x = x * 16; e.y = y * 16; this.freezeEnemy(e); e.hurtT = 0;
    return true;
  },
};
"""


class Runner:
    def __init__(self, pw, base, shots, query_extra=''):
        self.pw, self.base, self.shots, self.extra = pw, base, shots, query_extra
        self.browser = pw.chromium.launch(executable_path=CHROME, args=['--autoplay-policy=no-user-gesture-required'])
        self.errors = []

    def page(self, query='?test=1&nosave=1', **ctx_kw):
        ctx = self.browser.new_context(**ctx_kw)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and self.errors.append(m.text))
        pg.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)))
        q = query + (('&' if '?' in query else '?') + self.extra if self.extra else '')
        pg.goto(self.base + '/index.html' + q)
        pg.wait_for_function('window.__game && window.__game.ready', timeout=10000)
        pg.evaluate(HELPERS)
        return pg

    def shot(self, pg, name):
        path = os.path.join(self.shots, name + '.png')
        pg.screenshot(path=path)
        return path


def S(pg, expr='__game.state'):
    return pg.evaluate(expr)


def close_overlays(pg, maxn=40):
    for _ in range(maxn):
        st = S(pg)
        if not st['overlays']:
            return True
        pg.evaluate("__game.press('Enter', 16)")
        pg.evaluate("__game.step(200)")
    return not S(pg)['overlays']


def run(args):
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = f'http://127.0.0.1:{port}'
    os.makedirs(args.shots, exist_ok=True)
    extra = 'data=tools/fixtures' if args.fixtures else ''
    try:
        with sync_playwright() as pw:
            R = Runner(pw, base, args.shots, extra)
            if args.fixtures:
                fixture_suite(R)
            else:
                main_suite(R)
                mobile_suite(R)
                save_suite(R)
            check('no console errors', not R.errors, '; '.join(R.errors[:5]))
            R.browser.close()
    finally:
        srv.terminate()
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    return 1 if failed else 0


# ---------------------------------------------------------------------------------
def main_suite(R):
    pg = R.page(viewport={'width': 1024, 'height': 896})
    st = S(pg)
    check('boots to title', st['scene'] == 'title', st['scene'])
    R.shot(pg, '01_title')

    # font covers every character in the data files
    missing = pg.evaluate("""async () => {
      const f = await import('./js/font.js');
      const files = ['data/verses.json', 'data/i18n.json', 'data/maps/wilderness.json'];
      const miss = new Set();
      for (const p of files) { const txt = await (await fetch(p)).text(); for (const ch of txt) if (!f.hasGlyph(ch) && ch.charCodeAt(0) > 31) miss.add(ch); }
      return [...miss].join('');
    }""")
    check('bitmap font covers all data characters', missing == '', repr(missing))

    pg.evaluate("__game.press('Enter', 16)")
    R.shot(pg, '02_title_menu')
    pg.evaluate("__game.press('Enter', 16)")
    st = S(pg)
    check('title -> new game -> play', st['scene'] == 'play', st['scene'])
    check('starts with 3 hearts', st['player']['hearts'] == 3 and st['player']['maxHearts'] == 3)
    check('overworld music requested', st['music'] == 'overworld', st['music'])
    R.shot(pg, '03_play_start')

    # movement
    p0 = S(pg)['player']
    pg.evaluate("__game.press('ArrowRight', 500)")
    p1 = S(pg)['player']
    check('hero moves right', p1['px'] > p0['px'] + 20, f"{p0['px']}->{p1['px']}")
    check('hero faces right', p1['dir'] == 'right')
    # collision: walk up into the stone wall near the top of the map for 3 s
    pg.evaluate("__game.teleport(8, 3)")
    pg.evaluate("__game.press('ArrowUp', 3000)")
    p2 = S(pg)['player']
    solid_above = pg.evaluate("!__game.game.world.isWalkable(8, 1) || !__game.game.world.isWalkable(8,2)")
    check('collision stops hero at wall', p2['y'] >= 1 and solid_above, json.dumps(p2))
    hb_free = pg.evaluate("!__game.game.heroBlocked(__game.game.hero.hitbox())")
    check('hero never overlaps solids', hb_free)

    # talk to the elder
    elder = pg.evaluate("__game.game.npcs[0]")
    spot = pg.evaluate(f"__qa.standFor({elder['x']}, {elder['y']})")
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']}); __qa.face('{spot['dir']}')")
    pg.evaluate("__game.step(16)")
    R.shot(pg, '04_prompt')
    pg.evaluate("__game.press('KeyE', 16)")
    pg.evaluate("__game.step(400)")
    check('elder dialog opens', S(pg)['scene'] == 'dialog')
    R.shot(pg, '05_dialog')
    close_overlays(pg)
    check('dialog closes', S(pg)['scene'] == 'play')

    # sign is solid & readable
    sign = pg.evaluate("__game.game.signs[0]")
    spot = pg.evaluate(f"__qa.standFor({sign['x']}, {sign['y']})")
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']}); __qa.face('{spot['dir']}')")
    pg.evaluate("__game.press('KeyE', 16)")
    check('sign shows text', S(pg)['scene'] == 'dialog')
    close_overlays(pg)

    # open the sling chest by walking up and interacting
    chest = pg.evaluate("__game.game.chests.find(c => c.id === 'c_sling')")
    spot = pg.evaluate(f"__qa.standFor({chest['x']}, {chest['y']})")
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']}); __qa.face('{spot['dir']}')")
    pg.evaluate("__game.press('e', 16)")
    pg.evaluate("__game.step(500)")
    st = S(pg)
    check('chest opens -> ability reveal', st['scene'] == 'ability' and 'c_sling' in st['openedChests'], st['scene'])
    check('sling acquired + equipped', st['abilities'] == ['sling'] and st['equipped'] == 'sling')
    check('ability chest sets checkpoint', st['checkpoint']['id'] == 'c_sling', json.dumps(st['checkpoint']))
    R.shot(pg, '06_ability_reveal')
    close_overlays(pg)
    pg.evaluate("__game.step(300)")
    check('tip toast after ability', 'tip.sling' in S(pg)['toasts'], json.dumps(S(pg)['toasts']))
    check('no duplicate checkpoint toast at ability chest', 'ui.checkpoint' not in S(pg)['toasts'], json.dumps(S(pg)['toasts']))
    camp = pg.evaluate("__game.game.map.checkpoints[0]")
    pg.evaluate(f"__game.teleport({camp['x']}, {camp['y']})")
    pg.evaluate("__game.step(200)")
    check('checkpoint never moves backwards', S(pg)['checkpoint']['id'] == 'c_sling', json.dumps(S(pg)['checkpoint']))
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']})")
    R.shot(pg, '07_tip_toast')

    # verse chest (common) & golden
    verse_chests = pg.evaluate("__game.game.chests.filter(c => c.contains.type === 'verse').map(c => [c.id, c.contains.verseId])")
    golden = pg.evaluate("__game.game.versesData.verses.filter(v => v.rarity==='golden').map(v=>v.id)")
    common_id = next(c for c, v in verse_chests if v not in golden)
    golden_id = next(c for c, v in verse_chests if v in golden)
    pg.evaluate(f"__game.openChest('{common_id}')")
    pg.evaluate("__game.step(500)")
    check('verse chest -> verse card', S(pg)['scene'] == 'verse')
    R.shot(pg, '08_verse_card')
    close_overlays(pg)
    pg.evaluate(f"__game.openChest('{golden_id}')")
    pg.evaluate("__game.step(500)")
    R.shot(pg, '09_verse_golden_en')
    pg.evaluate("__game.press('l', 16)")
    pg.evaluate("__game.step(100)")
    check('language toggles to es', S(pg)['lang'] == 'es')
    R.shot(pg, '10_verse_golden_es')
    tag = pg.evaluate("__game.game.topOverlay().tag")
    check('Spanish verse uses NTV or RVR1909 tag', tag in ('NTV', 'RVR1909'), tag)
    close_overlays(pg)
    check('2 verses collected', len(S(pg)['verses']) == 2)

    # heart chest
    hchest = pg.evaluate("__game.game.chests.find(c => c.contains.type === 'heart').id")
    pg.evaluate(f"__game.openChest('{hchest}')")
    close_overlays(pg)
    check('heart chest +1 max heart', S(pg)['player']['maxHearts'] == 4)

    # pause & journal (Spanish)
    pg.evaluate("__game.press('Escape', 16)")
    check('pause menu opens', S(pg)['scene'] == 'pause')
    R.shot(pg, '11_pause_es')
    pg.evaluate("__game.press('ArrowDown', 16); __game.press('Enter', 16)")
    check('journal opens', S(pg)['scene'] == 'journal')
    R.shot(pg, '12_journal_es')
    pg.evaluate("__game.press('Escape', 16); __game.press('Escape', 16)")
    check('back to play', S(pg)['scene'] == 'play')
    pg.evaluate("__game.press('l', 16)")
    check('language back to en', S(pg)['lang'] == 'en')

    # arena is closed until the hero owns sun
    # open the entrance (burn the thorn hedge in place) so we can walk up to the arena edge
    ent = pg.evaluate("""(() => { const g = __game.game, w = g.world, a = g.map.boss.arena;
      for (let x = a.x; x < a.x + a.w; x++) {
        const t = w.get(x, a.y - 1);
        if (t !== 'thorn' && !w.isWalkable(x, a.y - 1)) continue;
        for (let y = a.y - 1; y >= a.y - 4 && w.get(x, y) === 'thorn'; y--) w.set(x, y, 'sand', false);
        if (__qa.walk(x, a.y - 2)) return { x, y: a.y - 2 };
      } })()""")
    pg.evaluate(f"__game.teleport({ent['x']}, {ent['y']})")
    pg.evaluate("__game.press('ArrowDown', 1500)")
    st = S(pg)
    a = pg.evaluate("__game.game.map.boss.arena")
    check('arena locked without sun', st['player']['y'] < a['y'] and 'sign.arena_locked' in st['toasts'], json.dumps(st['player']) + json.dumps(st['toasts']))
    pg.evaluate("__game.step(100)")
    R.shot(pg, '20b_arena_locked')
    fmt = pg.evaluate("(async () => (await import('./js/i18n.js')).format('{use} {cycle} {interact} {menu}'))()")
    check('input-aware placeholders (keyboard)', fmt == 'Space Q E Esc', fmt)

    # ---------------- abilities
    pg.evaluate("__game.give('all')")
    st = S(pg)
    check('give all abilities', st['abilities'] == ['sling', 'strength', 'staff', 'faith', 'fire', 'sun'])

    def equip(a):
        pg.evaluate(f"__game.game.progress.equipped = '{a}'; __game.game.cooldowns = {{}}")

    # sling kills a serpent
    # find an open horizontal lane of 6 walkable tiles
    lane = pg.evaluate("""(() => { const w = __game.game.world;
      for (let y = 2; y < w.h - 2; y++) for (let x = 1; x < w.w - 7; x++) {
        let ok = true; for (let i = 0; i < 6; i++) if (!__qa.walk(x + i, y)) ok = false;
        if (ok) return { x, y }; } })()""")
    pg.evaluate(f"__game.teleport({lane['x']}, {lane['y']}); __qa.face('right')")
    pg.evaluate(f"__qa.placeEnemy('serpent', {lane['x'] + 4}, {lane['y']})")
    equip('sling')
    pg.evaluate("__game.press('Space', 16)")
    pg.evaluate("__game.step(50)")
    R.shot(pg, '13_sling')
    pg.evaluate("__game.step(600)")
    serp = pg.evaluate(f"__game.game.enemies.filter(e => e.type==='serpent' && e.spawn && Math.abs(e.x - {(lane['x']+4)*16}) < 20 && Math.abs(e.y - {lane['y']*16}) < 20)")
    killed = pg.evaluate(f"__game.game.enemies.some(e => e.type==='serpent' && !e.alive)")
    check('sling stone kills serpent', killed)

    # strength breaks a boulder
    boulders = pg.evaluate("__qa.findTiles('boulder')")
    check('map has boulders', len(boulders) > 0)
    b = None
    for cand in boulders:
        sp = pg.evaluate(f"__qa.standFor({cand['x']}, {cand['y']})")
        if sp:
            b, spot = cand, sp
            break
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']}); __qa.face('{spot['dir']}')")
    equip('strength')
    pg.evaluate("__game.press('j', 16)")
    pg.evaluate("__game.step(100)")
    R.shot(pg, '14_strength')
    tile = pg.evaluate(f"__game.game.world.get({b['x']}, {b['y']})")
    check('strength smashes boulder -> sand', tile == 'sand', tile)
    check('map edit recorded', any(e['x'] == b['x'] and e['y'] == b['y'] for e in S(pg)['mapEdits']))

    # strength reach extends 6px beyond the front 16x16 box
    pg.evaluate(f"__game.teleport({lane['x']}, {lane['y']}); __qa.face('right'); __game.game.cooldowns = {{}}")
    pg.evaluate(f"""(() => {{ const e = __game.game.enemies.find(e => e.type==='scorpion' && e.alive); e.x = {lane['x']*16 + 28}; e.y = {lane['y']*16};
      __qa.freezeEnemy(e); e.hp = 5; e.hurtT = 0; window.__reachE = e; }})()""")
    pg.evaluate("__game.press('Space', 16)")
    check('strength reach hits enemy 6px further', pg.evaluate("window.__reachE.hp") == 2)

    # staff parts water: straight down from the beach (45,16) per maps agent; else any shore
    equip('staff')
    start = pg.evaluate("__qa.walk(45,16) && __game.game.world.get(45,17)==='water' ? {x:45,y:16,dir:'down'} : null")
    if not start:
        w = pg.evaluate("__qa.findTiles('water')")
        for c in w:
            sp = pg.evaluate(f"__qa.standFor({c['x']}, {c['y']})")
            if sp:
                start = sp; break
    pg.evaluate(f"__game.teleport({start['x']}, {start['y']}); __qa.face('{start['dir']}')")
    pg.evaluate("__game.press('Space', 16)")
    pg.evaluate("__game.step(200)")
    parted = len(pg.evaluate("__qa.findTiles('parted')"))
    check('staff parts water', parted >= 3, str(parted))
    R.shot(pg, '15_staff')
    # walk across the parted sea
    y0 = S(pg)['player']['y']
    for _ in range(6):
        pg.evaluate(f"__game.press('Arrow{start['dir'].capitalize()}', 600)")
        pg.evaluate("__game.game.cooldowns = {}; __game.press('Space', 16)")
    y1 = S(pg)['player']
    moved = abs(y1['y'] - y0) if start['dir'] in ('up', 'down') else abs(y1['x'] - start['x'])
    check('hero walks across the parted water', moved >= 4, json.dumps(y1))
    R.shot(pg, '16_staff_crossing')

    # faith: lions peaceful + shield
    pg.evaluate("__game.game.progress.abilities = __game.game.progress.abilities.filter(a => a !== 'faith')")
    lion_x, lion_y = pg.evaluate("(() => { const d = __qa.findTiles('den_floor').filter(t => __qa.walk(t.x,t.y) && __qa.walk(t.x+1,t.y)); return [d[5].x, d[5].y]; })()")
    pg.evaluate(f"__game.teleport({lion_x}, {lion_y}); __game.game.hero.hearts = 4; __game.game.hero.invuln = 0")
    pg.evaluate(f"__qa.placeEnemy('lion', {lion_x + 1}, {lion_y})")
    pg.evaluate("__game.step(300)")
    h_before = S(pg)['player']['hearts']
    check('lion deals 2 hearts without faith', h_before == 2, str(h_before))
    pg.evaluate("__game.give('faith'); __game.game.hero.hearts = 4; __game.game.hero.invuln = 0")
    pg.evaluate(f"__game.teleport({lion_x}, {lion_y}); __qa.placeEnemy('lion', {lion_x}, {lion_y})")
    pg.evaluate("__game.step(1000)")
    st = S(pg)
    check('lions peaceful with faith', st['player']['hearts'] == 4 and all(e['peaceful'] for e in st['enemies'] if e['type'] == 'lion'))
    check('den music in den', st['music'] == 'den', st['music'])
    equip('faith')
    pg.evaluate("__game.press('Space', 16)")
    check('faith shield active', S(pg)['player']['shield'])
    pg.evaluate("__game.game.hero.hurt(2, {x:0,y:0}, __game.game)")
    check('shield blocks damage', S(pg)['player']['hearts'] == 4)
    R.shot(pg, '17_faith_shield')

    # fire burns thorn exactly 3 tiles ahead
    thorns = pg.evaluate("__qa.findTiles('thorn')")
    check('map has thorns', len(thorns) > 0)
    spot = None
    for c in thorns:
        sp = pg.evaluate(f"__qa.standFor({c['x']}, {c['y']}, 3)")
        if sp:
            spot, tgt = sp, c; break
    pg.evaluate(f"__game.teleport({spot['x']}, {spot['y']}); __qa.face('{spot['dir']}')")
    equip('fire')
    pg.evaluate("__game.press('Space', 16)")
    pg.evaluate("__game.step(150)")
    R.shot(pg, '18_fire')
    check('fire burns thorn 3 tiles ahead', pg.evaluate(f"__game.game.world.get({tgt['x']}, {tgt['y']})") == 'sand')
    # adjacent thorn should not burn
    adj = pg.evaluate("""(() => { for (const c of __qa.findTiles('thorn')) { const s = __qa.standFor(c.x, c.y, 1); if (s) return {c, s}; } return null; })()""")
    if adj:
        pg.evaluate(f"__game.teleport({adj['s']['x']}, {adj['s']['y']}); __qa.face('{adj['s']['dir']}'); __game.game.cooldowns = {{}}")
        pg.evaluate("__game.press('Space', 16)")
        check('adjacent thorn not burned (2-4 tiles rule)', pg.evaluate(f"__game.game.world.get({adj['c']['x']}, {adj['c']['y']})") == 'thorn')

    # sun freezes enemies
    pg.evaluate(f"__game.teleport({lane['x']}, {lane['y']})")
    pg.evaluate(f"(() => {{ const e = __game.game.enemies.find(e => e.type==='jackal' && e.alive); e.x = {(lane['x']+3)*16}; e.y = {lane['y']*16}; }})()")
    equip('sun')
    pg.evaluate("__game.press('Space', 16)")
    pos0 = pg.evaluate("__game.game.enemies.filter(e=>e.alive).map(e=>[e.x,e.y])")
    pg.evaluate("__game.step(1000)")
    pos1 = pg.evaluate("__game.game.enemies.filter(e=>e.alive).map(e=>[e.x,e.y])")
    check('sun freezes enemies', S(pg)['freeze'] > 0 and pos0 == pos1)
    R.shot(pg, '19_sun_tint')
    pg.evaluate("__game.step(2500)")
    check('freeze ends after 3 s', S(pg)['freeze'] == 0)

    # cycle ability
    pg.evaluate("__game.game.progress.equipped = 'sling'")
    pg.evaluate("__game.press('q', 16)")
    check('Q cycles ability', S(pg)['equipped'] == 'strength')

    # game over and respawn
    pg.evaluate("__game.game.hero.invuln = 0; __game.game.hero.shield = 0; __game.game.hero.hurt(99, {x:0,y:0}, __game.game)")
    pg.evaluate("__game.step(1500)")
    check('death -> game over', S(pg)['scene'] == 'gameover', S(pg)['scene'])
    R.shot(pg, '20_gameover')
    pg.evaluate("__game.press('Enter', 16)")
    st = S(pg)
    check('respawn at checkpoint with full hearts', st['scene'] == 'play' and st['player']['hearts'] == st['player']['maxHearts'])

    boss_fight(R, pg)
    pg.context.close()


def boss_fight(R, pg):
    boss = pg.evaluate("__game.game.map.boss")
    a = boss['arena']
    pg.evaluate("__game.game.godMode = true")
    pg.evaluate(f"__game.teleport({a['x'] + 1}, {a['y'] + a['h'] - 2})")
    pg.evaluate("__game.step(400)")
    st = S(pg)
    check('boss music in arena', st['music'] == 'boss', st['music'])
    check('boss activates', st['bossState'] not in (None, 'idle'), str(st['bossState']))
    R.shot(pg, '21_boss')
    check('giant waits 1.5 s at spawn (intro) with name bar', st['bossState'] == 'intro' and
          pg.evaluate("__game.game.boss.x === __game.game.boss.spawn.x*16 && __game.game.boss.y === __game.game.boss.spawn.y*16"))
    pg.evaluate("__game.step(1300)")
    check('giant starts attacking after intro', S(pg)['bossState'] == 'walk', S(pg)['bossState'])
    # shockwave: ellipse-shaped hit area matching the drawing; frozen rings are harmless
    pg.evaluate("""(() => { const g = __game.game; g.godMode = false; const b = g.boss; b.state = 'walk'; b.t = 99;
      b.x = b.arena.x + 16; b.y = b.arena.y + 16;
      g.hero.x = b.arena.x + 100; g.hero.y = b.arena.y + 100; g.hero.hearts = 6; g.hero.maxHearts = 6; g.hero.invuln = 0; g.hero.shield = 0;
      const hc = g.hero.center(); g.shockwaves = [{ x: hc.x, y: hc.y - 28, r: 40, maxR: 64, hit: false }]; })()""")
    pg.evaluate("__game.step(16)")
    check('shockwave hits along its drawn ellipse', S(pg)['player']['hearts'] == 5, str(S(pg)['player']['hearts']))
    pg.evaluate("""(() => { const g = __game.game; g.hero.invuln = 0; g.freezeT = 3; const hc = g.hero.center();
      g.shockwaves = [{ x: hc.x, y: hc.y - 28, r: 40, maxR: 64, hit: false }]; })()""")
    pg.evaluate("__game.step(300)")
    check('frozen shockwave is harmless', S(pg)['player']['hearts'] == 5)
    pg.evaluate("__game.game.freezeT = 0; __game.game.shockwaves = []; __game.game.hero.invuln = 0")
    pg.evaluate("""(() => { const g = __game.game, b = g.boss; b.state = 'down'; b.t = 2.5; b.shield = false;
      g.hero.x = b.x + 8; g.hero.y = b.y + 12; g.hero.invuln = 0; })()""")
    pg.evaluate("__game.step(1000)")
    check('no contact damage during stomp recovery', S(pg)['player']['hearts'] == 5 and S(pg)['bossState'] == 'down')
    pg.evaluate("__game.step(1600)")
    check('shield-down window is 2.5 s', S(pg)['bossState'] != 'down', S(pg)['bossState'])
    pg.evaluate("__game.game.godMode = true")
    # shield up while walking: hits bounce
    pg.evaluate("__game.game.boss.state='walk'; __game.game.boss.t=5")
    hp0 = S(pg)['bossHp']
    pg.evaluate("""(() => { const g = __game.game, b = g.boss; g.hero.x = b.x + 8; g.hero.y = b.y + 34; g.hero.dir = 'up';
      g.progress.equipped = 'strength'; g.cooldowns = {}; })()""")
    pg.evaluate("__game.press('Space', 16)")
    check('shielded giant takes no damage', S(pg)['bossHp'] == hp0)
    # now fight: attack whenever vulnerable
    for i in range(400):
        st = S(pg)
        if st['bossHp'] in (0, None) or st['bossDefeated']:
            break
        pg.evaluate("""(() => { const g = __game.game, b = g.boss; if (!b || b.dead) return;
          g.hero.x = b.x + 8; g.hero.y = b.y + 30; g.hero.dir = 'up'; g.hero.kb = null;
          if ((g.cooldowns.sun||0) <= 0 && b.shield && g.freezeT <= 0) { g.progress.equipped = 'sun'; }
          else g.progress.equipped = 'strength'; })()""")
        pg.evaluate("__game.press('Space', 16)")
        pg.evaluate("__game.step(150)")
        if i == 6:
            R.shot(pg, '22_boss_fight')
    st = S(pg)
    check('boss defeated', st['bossDefeated'] and (st['bossHp'] in (0, None)), json.dumps({k: st[k] for k in ('bossHp', 'bossDefeated')}))
    pg.evaluate("__game.step(3000)")
    st = S(pg)
    check('victory scene', st['scene'] == 'victory', st['scene'])
    check('victory music', st['music'] == 'victory')
    R.shot(pg, '23_victory')
    pg.evaluate("__game.step(1200)")
    pg.evaluate("__game.press('Enter', 16)")
    check('victory -> credits', pg.evaluate("__game.game.victory.phase") == 'credits')
    pg.evaluate("__game.step(4000)")
    R.shot(pg, '24_credits')
    credits = pg.evaluate("__game.game.victory.credits.map(l => l.text).join(' ')")
    ntv_used = pg.evaluate("[...__game.game.versesData.verses, __game.game.versesData.victoryVerse].some(v => v && v.text && v.text.ntv)")
    check('credits include KJV + RV1909 (+ NTV only if NTV text used)',
          'King James' in credits and '1909' in credits and 'Scripture Quest' in credits and (('Tyndale' in credits) == bool(ntv_used)))
    # finish credits -> title
    for _ in range(30):
        pg.evaluate("__game.press('Enter', 1000)")
        if S(pg)['scene'] == 'title':
            break
    check('credits return to title', S(pg)['scene'] == 'title')


def mobile_suite(R):
    pg = R.page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=3)
    vis = pg.evaluate("getComputedStyle(document.getElementById('touch')).display !== 'none'")
    check('mobile: touch controls visible', vis)
    box = pg.evaluate("(() => { const r = document.getElementById('game').getBoundingClientRect(); return {w:r.width,h:r.height,top:r.top,left:r.left}; })()")
    check('mobile: canvas fits width', box['w'] <= 390 and box['left'] >= 0 and box['w'] >= 300, json.dumps(box))
    dpad = pg.evaluate("(() => { const r = document.querySelector('.dpad').getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; })()")
    check('mobile: controls below canvas & on screen', dpad['top'] >= box['top'] + box['h'] - 1 and dpad['bottom'] <= 844, json.dumps(dpad))
    check('mobile: controls close under canvas', dpad['top'] - (box['top'] + box['h']) < 60, json.dumps([box, dpad]))
    check('mobile: no page scroll', pg.evaluate("document.documentElement.scrollHeight <= innerHeight + 1"))
    # tap A to start, A again for new game
    pg.tap('.btn.a'); pg.evaluate("__game.step(50)")
    pg.tap('.btn.a'); pg.evaluate("__game.step(50)")
    check('mobile: A button starts game', S(pg)['scene'] == 'play', S(pg)['scene'])
    fmt = pg.evaluate("(async () => (await import('./js/i18n.js')).format('{use} {cycle} {interact} {menu}'))()")
    check('input-aware placeholders (touch)', fmt == 'B ⟳ A ☰', fmt)
    # hold the D-pad right via pointer events
    p0 = S(pg)['player']['px']
    r = pg.evaluate("(() => { const r = document.querySelector('.dpad').getBoundingClientRect(); return {x: r.right - 15, y: r.top + r.height/2}; })()")
    pg.evaluate(f"""(() => {{ const d = document.querySelector('.dpad');
      d.dispatchEvent(new PointerEvent('pointerdown', {{pointerId: 7, clientX: {r['x']}, clientY: {r['y']}, bubbles: true, pointerType: 'touch'}})); }})()""")
    pg.evaluate("__game.step(500)")
    pg.evaluate("document.querySelector('.dpad').dispatchEvent(new PointerEvent('pointerup', {pointerId: 7, bubbles: true}))")
    check('mobile: D-pad moves hero', S(pg)['player']['px'] > p0 + 10)
    pg.evaluate("__game.step(50)")
    R.shot(pg, '25_mobile')
    pg.tap('.btn.small[data-action="pause"]'); pg.evaluate("__game.step(50)")
    check('mobile: menu button opens pause', S(pg)['scene'] == 'pause')
    R.shot(pg, '26_mobile_pause')
    pg.context.close()
    # landscape phone
    pg = R.page(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=3)
    pg.evaluate("__game.setScene('play')")
    R.shot(pg, '27_mobile_landscape')
    box = pg.evaluate("(() => { const r = document.getElementById('game').getBoundingClientRect(); return {w:r.width,h:r.height}; })()")
    check('landscape: canvas fits', box['h'] <= 390 and box['w'] <= 844, json.dumps(box))
    pg.context.close()


def save_suite(R):
    pg = R.page('?test=1')
    pg.evaluate("localStorage.clear()")
    pg.reload(); pg.wait_for_function('window.__game && window.__game.ready'); pg.evaluate(HELPERS)
    pg.evaluate("__game.press('Enter', 16); __game.press('Enter', 16)")
    pg.evaluate("__game.openChest('c_sling')")
    close_overlays(pg)
    vid = pg.evaluate("__game.game.chests.find(c => c.contains.type==='verse').id")
    pg.evaluate(f"__game.openChest('{vid}')")
    close_overlays(pg)
    elder = pg.evaluate("__game.game.npcs[0]")
    sp = pg.evaluate(f"__qa.standFor({elder['x']}, {elder['y']})")
    pg.evaluate(f"__game.teleport({sp['x']}, {sp['y']}); __qa.face('{sp['dir']}')")
    pg.evaluate("__game.press('e', 16)")
    close_overlays(pg)
    pg.evaluate("__game.give('strength')")
    b = pg.evaluate("__qa.findTiles('boulder')[0]")
    sp = pg.evaluate(f"__qa.standFor({b['x']}, {b['y']})")
    pg.evaluate(f"__game.teleport({sp['x']}, {sp['y']}); __qa.face('{sp['dir']}')")
    pg.evaluate("__game.press('Space', 16)")
    pg.evaluate("__game.press('l', 16)")
    raw = pg.evaluate("JSON.parse(localStorage.getItem('scripture-quest-save-v1'))")
    keys = {'lang', 'muted', 'hearts', 'maxHearts', 'abilities', 'equipped', 'verses', 'openedChests', 'mapEdits', 'checkpoint', 'bossDefeated'}
    check('save has GDD keys', raw and keys <= set(raw.keys()), str(raw and sorted(raw.keys())))
    check('save persists talkedToElder', raw.get('talkedToElder') is True)
    pg.reload(); pg.wait_for_function('window.__game && window.__game.ready'); pg.evaluate(HELPERS)
    check('reload keeps language', S(pg)['lang'] == 'es')
    pg.evaluate("__game.press('Enter', 16)")
    R.shot(pg, '28_title_continue_es')
    items = pg.evaluate("__game.game.title.items().map(i => i.id)")
    check('title offers Continue', items[0] == 'continue', str(items))
    pg.evaluate("__game.press('Enter', 16)")
    st = S(pg)
    check('continue restores abilities/verses/chests', 'sling' in st['abilities'] and len(st['verses']) == 1 and vid in st['openedChests'])
    check('continue restores map edits', pg.evaluate(f"__game.game.world.get({b['x']}, {b['y']})") == 'sand')
    check('continue spawns at checkpoint', st['player']['x'] == st['checkpoint']['x'] and st['player']['y'] == st['checkpoint']['y'])
    check('continue restores talkedToElder', pg.evaluate("__game.game.talked.has('elder')"))
    # New Game with a save asks for confirmation (default No)
    pg.evaluate("__game.setScene('title')")
    pg.evaluate("__game.press('Enter', 16); __game.press('ArrowDown', 16); __game.press('Enter', 16)")
    check('new game asks to confirm', S(pg)['scene'] == 'confirm', S(pg)['scene'])
    R.shot(pg, '29_confirm_new')
    pg.evaluate("__game.press('Enter', 16)")
    check('confirm defaults to No (save kept)', S(pg)['scene'] == 'title' and pg.evaluate("__game.game.hasSave()"))
    pg.evaluate("__game.press('Enter', 16); __game.press('ArrowLeft', 16); __game.press('Enter', 16)")
    st = S(pg)
    check('confirm Yes starts fresh game', st['scene'] == 'play' and st['verses'] == [] and st['abilities'] == [])
    pg.evaluate("localStorage.clear()")
    pg.context.close()


def fixture_suite(R):
    pg = R.page(viewport={'width': 768, 'height': 672})
    pg.evaluate("__game.setScene('play')")
    check('fixtures: play', S(pg)['scene'] == 'play')
    for c in pg.evaluate("__game.game.chests.map(c => c.id)"):
        pg.evaluate(f"__game.openChest('{c}')")
        close_overlays(pg)
    st = S(pg)
    check('fixtures: all chests opened', len(st['openedChests']) == len(pg.evaluate("__game.game.chests")))
    check('fixtures: 6 abilities', len(st['abilities']) == 6)
    R.shot(pg, 'fx_01_play')
    boss_fight(R, pg)
    pg.context.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixtures', action='store_true', help='run against tools/fixtures data')
    ap.add_argument('--shots', default='/tmp/sq')
    sys.exit(run(ap.parse_args()))
