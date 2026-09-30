# Stave

A browser music arranger from WorldWideVibes. Five lanes — Melody, Piano, Bass, Kit, and Voice — on one page. You pick an instrument, set level and pan, mute or solo a lane, tap a lane to seek, and drag notes and clips. The computer keyboard plays notes (A–K, Z/X for octave). Record arms a take. There is also a drum grid, a score view, vocal record and tune, mix export (WAV), and print score.

**Play it:** https://solar-zenith-hazel-ivory.grok.me

**Buy it (CAD $9):** https://caetano72.gumroad.com/l/stave

The page title is Stave. The page description is: “Compose with a keyboard, drums, sheet music, and tuned vocals.”

The built-in demo is named **Night window** (96 BPM, 4/4, 8 bars, C major, loop on). The transport reads **Bar 1** at the start. Until you save, the header says “Demo piece.” Saves stay on this device (“Saved on this device”). There is no account.

## What is in this repo

Source returned by Build on 30 Sep 2026 PT, plus this README. It does not include node_modules or a production build. The live host still sends `x-robots-tag: noindex`, and Build said that header cannot be turned off from the app.

## What this is not

Not a DAW with accounts, cloud sync, or a sample store. Not a game. Not Hollowpath, Dropforge, or Skill Creator. One product, one repo. Price is CAD $9 on Gumroad.

Catalog: [wwv-site](https://github.com/w0rldwid3vib3s/wwv-site)

## Run it locally

```
npm install
npm run dev
```

The dev server listens on port 8080. `npm run build` makes a production build. No account is required. The piece stays in this browser.
