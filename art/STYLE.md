# Mall Bats — Art Style Guide

**One line:** a dying 2004 shopping mall drawn like a cozy late-era SNES/GBA isometric sim — warm, slightly shabby, a little ridiculous.

## Pillars

1. **Mall nostalgia, not mall glamour.** Northgate Mall peaked in 1996. Teal and mauve, brass trim, terrazzo, fake palms, fluorescent hum. Everything is a little scuffed, faded, taped up.
2. **One joke per object.** Every prop carries a small storytelling detail: gum under the bench, a "SALE" sticker peeling off, duct tape on the cooler, a Furby wedged in the toy bin, a Dave Matthews Band sticker on the mini-fridge. Detail is a wink, not clutter.
3. **Two worlds, one palette.** The mall floor is bright, clean-ish and corporate. The ceiling is the squatters' world: plywood, extension cords, salvaged junk, warm lamp light. Same palette, different temperature.
4. **Readable at a glance.** Silhouette first. A player at 1x zoom must tell a vending machine from an arcade cabinet from a payphone in one look.

## Technical rules

| Rule | Value |
| --- | --- |
| Projection | 2:1 dimetric ("isometric"), tile = 64×32 px |
| Pixel density | 1 art pixel = 1 world unit at zoom 1. Never mix densities. |
| Light | Key light from the upper-left. Left faces mid, right faces dark, tops lightest. |
| Outline | Selective dark outline (darkest ramp of the local color, `#1b1622` at most). No pure black. |
| Shading | Medium: 3–4 tones per material. No dithering gradients, no anti-aliased soft edges. |
| Palette | `art/palette.hex` only. Every sprite is snapped to it at build time. |
| Background | Transparent. No floor tile, no cast shadow, no drop shadow under props. |
| Text | **No legible text or logos.** AI lettering is mush. Use color blocks that read as signage; real text stays procedural (`isoText`). |

### Sizes (art pixels)

| Category | Footprint | Typical sprite |
| --- | --- | --- |
| Small prop (trash can, payphone, lamp) | < 1 tile | 16–36 wide |
| Standard prop (shelf, cabinet, counter) | 1 tile | 44–64 wide, up to 80 tall |
| Large prop (fountain, prize counter, service desk) | 2 tiles | 96–128 wide |
| Character | 1 agent | 48×48 canvas, figure ~34 tall |
| Floor texture | 1 tile | 32×32 top-down, baked into the iso diamond at runtime |

**Anchoring:** a prop's base diamond is assumed to be inscribed in its sprite width. The renderer places the sprite so its bottom pixel sits at `tileCenterY + baseWidth / 4`, horizontally centered on the footprint. Tall or wide-topped props (palms, lampposts) declare a smaller `base` width in `art/assets.ts`.

## Color language

- **Mall teal `#2aa6a0` + bubblegum `#dc348c`** are the brand of Northgate Mall: fountain, court, food court, kiosks.
- **Warm neutrals** (terrazzo, plaster) for public space; **steel/concrete** for back-of-house.
- **Neons** (`#2bfff0`, `#ff2bd6`, `#c6ff2b`) are reserved for things that glow: arcade, blacklight, screens, lava lamps.
- **Wood/cardboard** dominates the ceiling: plywood decks, milk crates, boxes.
- **Faded denim and khaki** ramps exist for 2004 clothing; characters read best in them.
- Characters keep a personal palette: animation frames are snapped to the colors of the character's own standing rotations so walk cycles don't flicker.
- Each store keeps its accent from `layout.ts` (West 49 black/yellow, The Source red/white, Blockbuster navy/yellow...).

## HUD

The HUD reads as mall signage: dark plum backlit panels, teal header bars with the magenta + gold "mall stripe" underneath.

- **Fonts** (self-hosted via `@fontsource`, CSP blocks remote fonts): `Jersey 10` for headings, names and big numbers; `Pixelify Bats` (Pixelify Sans with a redrawn 2 and 5, built by `scripts/fonts/patch-digits.py` into `src/assets/fonts/`) for body copy; `VT323` for all-caps labels, key hints and LED readouts (clock, log timestamps), at 12px or larger so 8 and 2 stay legible. Canvas text uses `BODY_FONT` / `DISPLAY_FONT` from `src/render/draw.ts`.
- **Shapes**: no rounded corners or gradients-as-gloss. Panels and buttons use the notched pixel outline (`--outline`, `--outline-3`), a 2px top highlight, a darker bottom edge, and a hard offset drop shadow.
- **Buttons**: `.btn` is teal, `.on` magenta, `.danger` red, `.ghost` plum. Show hotkeys with `<kbd>`.
- **Icons**: no emoji. Use `icon.*` assets via `<Icon name>` (`src/ui/icons.tsx`), 32px native (16px for inline); modal art is 64px shown at 128px.

## What stays procedural

Pixel sprites replace geometry, not systems. These stay drawn in code so they stay dynamic:

- Walls, storefront gates and glass, store signs and all text
- Lighting, darkness, guard/camera cones, overlays, cursor, HUD bubbles
- Tiny motion effects layered on top of sprites: fountain spray, steam, sparks, screen glow, blinking lights

## Prompt recipe

Every prompt is built by `scripts/art/prompts.ts` as:

```
{subject}, {quirk detail}. {category suffix}
```

- **Prop suffix:** `isometric pixel art game prop, 2004 american shopping mall, cozy quirky, light from upper left, transparent background, no text`
- **Ceiling prop suffix:** adds `scavenged, makeshift, lived-in`
- **Character suffix:** `pixel art game character, full body, 2004 fashion, cozy quirky`
- **Floor suffix:** `top-down seamless floor texture, flat, no perspective, no objects`

Style params are fixed per category (outline, shading, detail, view). Don't override them per asset unless an asset fails twice.

## Workflow

The PixelLab key lives in `.env` as `PIXELLAB_SECRET` (gitignored). Bun loads it automatically.

```bash
npm run art:generate -- --only fixture.vending          # 4 more candidates for one asset (prefixes work: --only char.shopper)
npm run art:generate -- --category prop --missing       # everything in a category without candidates yet
npm run art:generate -- --only fixture.car --n 2        # override the candidate count
npm run dev                                             # open http://localhost:5173/art-review.html to pick winners
npm run art:build                                       # palette-snap, trim, write src/assets/sprites + manifest
```

Characters made outside the script (PixelLab web UI, or a run that died midway) can be pulled in by id:

```bash
npm run art:generate -- --import char.crew.emo=<character-id>    # download rotations + animations as-is
npm run art:generate -- --animate char.crew.emo=<character-id>   # add the walk cycle first, then download
```

- New asset: add an entry to `art/assets.ts`, generate, pick, build. The renderer looks sprites up by id, so `fixture.<kind>.<roomId>` overrides `fixture.<kind>` for one store, and `build.<type>` covers ceiling buildables.
- `art/raw/<id>/` holds every candidate plus a JSON with its prompt and seed. `art/selections.json` holds picks: a number, an array for variants, or `{ "pick": 2, "flip": true }` to mirror a sprite.
- The review page flags candidates that touch the canvas edge as **clipped**. Give that asset a bigger `canvas` and regenerate rather than picking it.
- Concurrency: PixelLab caps concurrent jobs per account. The client retries 429s and animates two directions at a time so several characters can run side by side. `PIXELLAB_MAX_JOBS` limits in-flight image jobs per process.
- Generation is never part of the game build. `src/assets/sprites` is the committed, shippable output. Anything without a sprite falls back to its procedural drawing, so art can land incrementally.

## Review checklist

Before picking a candidate, check:

- [ ] Reads as the right object at 1x zoom
- [ ] Correct iso angle (2:1), not top-down or front-on
- [ ] Light from upper-left
- [ ] No baked floor or shadow, no garbled text
- [ ] Has its one quirky detail
- [ ] Sits next to its neighbors without looking pasted in (density, outline weight, saturation)
