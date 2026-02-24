# Stream Deck Plugin Development — Reference

This document records what we learned about the Stream Deck plugin system from the
working test plugin at `C:\Users\User\test-plugin\`. Use this as a hard reference
for any future changes to this project.

---

## Working Plugin Reference

The test plugin at `C:\Users\User\test-plugin\com.brenan.test-plugin.sdPlugin\` was
created with `streamdeck create` (Elgato CLI 1.7.1) and confirmed working on hardware.

### File Layout

```
test-plugin/                         ← project root (on Windows filesystem)
├── src/
│   ├── plugin.ts                    ← entry point
│   └── actions/increment-counter.ts ← action class
├── com.brenan.test-plugin.sdPlugin/ ← the actual plugin (linked into SD plugins dir)
│   ├── manifest.json
│   ├── bin/
│   │   ├── plugin.js                ← minified bundle (output of rollup)
│   │   └── package.json             ← {"type": "module"} — REQUIRED
│   ├── ui/
│   │   └── increment-counter.html   ← property inspector (optional)
│   └── imgs/
├── package.json                     ← build scripts + deps
├── rollup.config.mjs                ← bundles src/ → sdPlugin/bin/plugin.js
└── tsconfig.json
```

Key: the **source** lives outside the `.sdPlugin` folder. The `.sdPlugin` folder
contains only the **built output**. Rollup bundles everything into one `bin/plugin.js`.

### manifest.json — Required Fields

```json
{
  "SDKVersion": 3,                          ← must be 3 (not 2)
  "Software": { "MinimumVersion": "6.9" },  ← required
  "OS": [                                   ← required
    { "Platform": "windows", "MinimumVersion": "10" },
    { "Platform": "mac",     "MinimumVersion": "12" }
  ],
  "Nodejs": { "Version": "20", "Debug": "enabled" },
  "CodePath": "bin/plugin.js",
  "Actions": [{
    "Controllers": ["Keypad"],              ← required; "Keypad" = regular buttons
    "States": [{ "Image": "...", "TitleAlignment": "middle" }]
  }]
}
```

**SDKVersion 2 vs 3:** The plugin will not load correctly with `SDKVersion: 2`.
All modern plugins (created 2024+) use `SDKVersion: 3`.

### bin/package.json — Required

```json
{ "type": "module" }
```

Node.js needs this to treat `plugin.js` (which uses ES module syntax from the rollup
bundle) as an ESM file. Without it, `import` statements fail at runtime.

### Build System

The build uses rollup with:
- `@rollup/plugin-typescript` — compiles TypeScript
- `@rollup/plugin-node-resolve` — resolves node_modules
- `@rollup/plugin-commonjs` — converts CJS modules to ESM
- `@rollup/plugin-terser` — minifies (production only, not watch mode)
- Custom plugin that emits `bin/package.json`

Output is a **single self-contained file** with all dependencies bundled. No
`node_modules` is needed at runtime on the Windows side.

### Node.js Versions Bundled with Stream Deck

| Stream Deck | Bundled Node.js |
|-------------|-----------------|
| 7.1         | 20.19.5, 24.9.0 |
| 7.0 / 6.9   | 20.19.0         |
| 6.8         | 20.18.0         |
| 6.7         | 20.15.0         |
| 6.6 / 6.5   | 20.8.1          |
| 6.4         | 20.5.1          |

Source: https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/

### Official SDK (@elgato/streamdeck v2.0.0)

Action pattern:

```typescript
import { action, SingletonAction, WillAppearEvent, KeyDownEvent } from "@elgato/streamdeck";

@action({ UUID: "com.example.plugin.my-action" })
export class MyAction extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void | Promise<void> {
    void ev.action.setImage("data:image/svg+xml,...");
    void ev.action.setTitle("hello");
  }
  override onKeyDown(ev: KeyDownEvent): void | Promise<void> { ... }
}
```

Entry point:

```typescript
import streamDeck from "@elgato/streamdeck";
import { MyAction } from "./actions/my-action";

streamDeck.logger.setLevel("trace");
streamDeck.actions.registerAction(new MyAction());
streamDeck.connect();
```

---

## CLI Reference

**Prerequisites:** Node.js on Windows + `npm install -g @elgato/cli@latest`

| Command | What it does |
|---------|-------------|
| `streamdeck dev` | Enable developer mode (one-time) |
| `streamdeck dev --disable` | Disable developer mode |
| `streamdeck link [path]` | Link plugin dir into SD plugins folder (creates symlink) |
| `streamdeck restart <uuid>` | Stop + start the plugin (reloads manifest too) |
| `streamdeck stop <uuid>` | Stop plugin without restarting |
| `streamdeck list` | List installed plugins |
| `streamdeck validate [path]` | Validate plugin structure |
| `streamdeck pack [path]` | Package into `.streamDeckPlugin` file |

Sources:
- https://docs.elgato.com/streamdeck/cli/commands/link
- https://docs.elgato.com/streamdeck/cli/commands/restart
- https://docs.elgato.com/streamdeck/cli/commands/dev

### `streamdeck link` Detail

- Syntax: `streamdeck link <path>` (or run from inside the `.sdPlugin` parent dir)
- The directory name **must** be `<UUID>.sdPlugin`
- Creates a symlink: `%APPDATA%\Elgato\StreamDeck\Plugins\<UUID>.sdPlugin` → source path
- For development: the source project lives on the Windows filesystem; changes to
  `bin/plugin.js` are reflected immediately after `streamdeck restart`

### `streamdeck restart` Detail

- Syntax: `streamdeck restart <uuid>` (UUID without `.sdPlugin`)
- Reloads the plugin **and** its manifest
- Use this after `install.sh` copies updated files to the plugins folder

---

## Install Workflow for This Project

This plugin's source lives in WSL2. The workflow:

```
WSL2: npm run build        → produces com.claude-code.usage-monitor.sdPlugin/bin/plugin.js
WSL2: bash install.sh      → copies .sdPlugin folder to Windows plugins dir
Windows PS: streamdeck restart com.claude-code.usage-monitor
```

There is no `streamdeck link` step because the source is in WSL2 (symlinks to WSL2
paths are fragile). Instead, `install.sh` does a direct copy.

---

## Image Rendering

`action.setImage(image)` accepts:
- `data:image/svg+xml,<url-encoded SVG>` — vector, any complexity
- `data:image/png;base64,<base64>` — raster
- `null` — reverts to the manifest default state image

Button key size: **72×72 pixels** (144×144 at HiDPI). Max recommended update rate: 10/sec.
For our 60-second poll, this is never a constraint.

SVG text positioning (72×72 canvas):
- Line 1 label: y≈13 (9px)
- Main number: y≈38 (26px bold)
- Subtext: y≈50 (9px)
- Divider line: y=55
- Footer: y≈66 (9px)
