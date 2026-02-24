# Stream Deck on Linux / WSL2

*Research by subagent (claude-sonnet-4-6), 2026-02-24*

---

## Section 1: Library Landscape

### Python: `python-elgato-streamdeck` (PyPI: `streamdeck`)

- Source: https://github.com/abcminiuser/python-elgato-streamdeck
- Docs: https://python-elgato-streamdeck.readthedocs.io/en/stable/
- PyPI: https://pypi.org/project/streamdeck/
- Version: 0.9.8 (September 2025) — actively maintained
- **Talks directly to hardware over USB**, bypassing Elgato software entirely
- HID backend: `libhidapi-libusb0` (libusb, NOT hidraw — avoids hidraw buffer issue)
- Linux system deps: `libudev-dev`, `libusb-1.0-0-dev`, `libhidapi-libusb0`, `libjpeg-dev`, `zlib1g-dev`
- Requires udev rule for non-root access (vendor ID `0fd9`)
- **Conflict:** When Elgato software has the device on Windows, this library cannot access it simultaneously

### Python: `streamdeck-sdk` / Plugin SDKs

- PyPI: https://pypi.org/project/streamdeck-sdk/
- GitHub: https://github.com/gri-gus/streamdeck-python-sdk
- **Does NOT talk to hardware directly** — communicates via WebSocket with the Elgato software
- Plugin process must run on Windows (launched by Elgato software with `-port -pluginUUID -registerEvent -info` args)
- Must connect back to `ws://127.0.0.1:<PORT>` within 30 seconds

### Node.js: `@elgato-stream-deck/node`

- Source: https://github.com/Julusian/node-elgato-stream-deck
- npm: https://www.npmjs.com/package/@elgato-stream-deck/node
- Version: 7.5.2 (January 2026) — actively maintained
- Talks directly to hardware, no Elgato software needed
- Uses `node-hid`, defaults to hidraw on Linux
- **Known issue:** hidraw driver has `HID_MAX_DESCRIPTOR_SIZE` = 4096 bytes, Stream Deck needs 8192-byte buffers — may fail. Use libusb backend instead.

### Node.js: `@elgato/streamdeck` (Official SDK)

- Source: https://github.com/elgatosf/streamdeck
- npm: https://www.npmjs.com/package/@elgato/streamdeck
- Communicates through Elgato software via WebSocket, does NOT talk to hardware directly
- Plugin runs on Windows; Stream Deck 7.1 bundles Node.js 20/24 (no separate install needed)
- Exposes `action.setTitle()`, `action.setImage()`, `setInterval()` for periodic updates

### Library Summary

| Library | Language | Direct USB | Requires Elgato SW | Runs On |
|---|---|---|---|---|
| `python-elgato-streamdeck` | Python | YES | No | Linux/macOS/Windows |
| `@elgato-stream-deck/node` | Node.js | YES | No | Linux/macOS/Windows |
| `streamdeck-sdk` (plugin) | Python | No | YES | Windows/macOS only |
| `@elgato/streamdeck` (official) | Node.js/TS | No | YES | Windows/macOS only |

---

## Section 2: WSL2 USB Access

### The Core Problem

WSL2 runs inside Hyper-V. USB devices connected to Windows are not forwarded into the VM. Confirmed in this environment: no `/dev/hidraw*`, no `/dev/bus/usb/`.

### The Solution: usbipd-win

- Source: https://github.com/dorssel/usbipd-win
- Microsoft docs: https://learn.microsoft.com/en-us/windows/wsl/connect-usb

```powershell
# Install on Windows
winget install --interactive --exact dorssel.usbipd-win

# List devices
usbipd list

# Bind (admin, one-time)
usbipd bind --busid <BUSID>

# Attach to WSL2 (no admin needed after binding)
usbipd attach --wsl --busid <BUSID>
```

After attach, verify in WSL2:
```bash
lsusb          # Elgato VID 0fd9 should appear
ls /dev/hidraw*  # should exist
```

### Kernel Status — **Confirmed Good**

This WSL2 kernel (`6.6.87.2-microsoft-standard-WSL2`) has:
```
CONFIG_HIDRAW=y       # built-in — /dev/hidraw* nodes appear automatically
CONFIG_USB_HIDDEV=y   # built-in
CONFIG_USBIP_CORE=m   # module available
CONFIG_USBIP_VHCI_HCD=m  # module available
```

`CONFIG_HIDRAW=y` was added in `linux-msft-wsl-5.15.150.1` (March 2024) — https://github.com/microsoft/WSL/issues/10526.
**No custom kernel needed.**

### Known Friction

1. **`linux-tools` package warning**: `usbipd attach --wsl` may warn that `linux-tools-6.6.x-microsoft-standard-WSL2` is missing. Workaround: `sudo apt install linux-tools-virtual-hwe-22.04`. Warning is cosmetic in usbipd 4.x — see https://github.com/dorssel/usbipd-win/issues/646

2. **udev rules required** (non-root access):
   ```
   # /etc/udev/rules.d/70-streamdeck.rules
   SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", MODE="0666"
   KERNEL=="hidraw*", ATTRS{idVendor}=="0fd9", MODE="0666"
   ```

3. **Exclusivity**: `usbipd attach` detaches the device from Windows. The Elgato software loses access. You must either use the Linux path OR the Windows path — not both simultaneously.

---

## Section 3: Windows-Side Approaches

### The Elgato Plugin WebSocket Protocol

- Architecture: https://docs.elgato.com/sdk/plugins/architecture
- Events sent: https://docs.elgato.com/sdk/plugins/events-sent
- Registration: https://docs.elgato.com/sdk/plugins/registration-procedure

The Stream Deck software on Windows acts as a WebSocket server on a dynamic localhost port. Plugins are child processes launched with:
```
-port <N> -pluginUUID <UUID> -registerEvent registerPlugin -info <JSON>
```
Plugin must connect to `ws://127.0.0.1:<N>` and register within 30 seconds.

`CodePath` in `manifest.json` can be a `.js` file (run by bundled Node.js) or a `.exe` (Windows native). A Node.js plugin can call `child_process.execFile('wsl.exe', ...)` to run WSL2 scripts.

### Useful Existing Plugins

**streamdeck-textfiletools** (BarRaider)
- Source: https://github.com/BarRaider/streamdeck-textfiletools
- Marketplace: https://marketplace.elgato.com/product/text-file-tools-8ed62b66-35f3-44fe-b801-486976ddd188
- Displays last word (or regex match) from a text file on a button
- **Auto-refresh interval behavior is unconfirmed** — may only update on press, not on timer

**streamdeck-commandline**
- Source: https://github.com/mikepowell/streamdeck-commandline
- Executes a Windows command line on button press. Can invoke `wsl.exe` but does not display stdout on button.

### WSL2 Networking for Windows→WSL2 IPC

- Microsoft docs: https://learn.microsoft.com/en-us/windows/wsl/networking
- Default (NAT mode): Windows-to-WSL2 via host IP from `/etc/resolv.conf`
- **Mirrored networking** (Windows 11 22H2+): `127.0.0.1` works both ways
  - Add to `%UserProfile%\.wslconfig`: `[wsl2]` → `networkingMode=mirrored`

---

## Section 4: Most Viable Architecture

### **Approach A (Recommended): Native Windows Plugin → wsl.exe → WSL2 Script**

No USB passthrough needed. Stream Deck stays managed by Elgato software on Windows.

```
WSL2 script (get-stats.sh) ← spawned by →
  Windows Node.js plugin (CodePath: bin/plugin.js)
    using child_process.execFile("wsl.exe", ["-e", "bash", "-c", "/path/to/get-stats.sh"])
    captures stdout → calls action.setTitle(capturedOutput)
        ↓ WebSocket ↓
  Elgato Stream Deck software (Windows, ws://127.0.0.1:<port>)
        ↓ USB ↓
  Stream Deck hardware button
```

**Build requirements:**
1. `manifest.json` declaring the plugin
2. `bin/plugin.js` with one action class, `setInterval` polling loop (e.g., 60s), calls `wsl.exe`
3. `get-stats.sh` in WSL2: runs `npx ccusage --json`, formats one line of text, prints to stdout

**Why:**
- No usbipd setup, no udev rules, no USB passthrough complexity
- Existing Stream Deck profiles and button configs on Windows keep working
- WSL2 logic stays in Linux
- Ships as a standard `.sdPlugin` package

### Approach B: usbipd + python-elgato-streamdeck (Full Linux Control)

```
Stream Deck (USB) → usbipd-win (Windows) → /dev/hidraw* (WSL2)
  → python-elgato-streamdeck → Python polling loop (WSL2)
```

**Pros:** Entirely in Linux, full programmatic control, Pillow for rich rendering
**Cons:** Requires usbipd setup every session, Elgato software loses device, hidraw buffer issue unconfirmed, existing Windows button profiles unavailable while attached

### Approach C (Prototype Only): Text File Bridge

WSL2 cron writes to `/mnt/c/Users/<user>/streamdeck-stat.txt`, Text File Tools plugin displays it. Zero Stream Deck programming. **Auto-refresh behavior unconfirmed** — may only update on press.

---

## Section 5: Unknown Blockers (Must Test Hands-On)

1. **hidraw buffer size at kernel 6.6**: Stream Deck needs 8192-byte write buffers; hidraw historically caps at 4096. `python-elgato-streamdeck` uses libusb (not hidraw) and may avoid this, but unconfirmed. Source: https://github.com/node-hid/node-hid/issues/456

2. **usbipd attach reliability**: `usbipd attach --wsl` has reported failures on some 6.6 kernel configs despite USBIP modules being present as `=m`. Source: https://github.com/dorssel/usbipd-win/issues/861

3. **Text File Tools auto-refresh**: Does "Last Word Display" poll the file on a timer? README does not document an interval. Must test.

4. **wsl.exe cold start latency**: First call from a Windows plugin may take several seconds if WSL2 isn't already running. Mitigation: keep WSL2 running, pre-start in plugin's `onConnected` hook.

5. **Elgato software USB exclusivity**: Whether the Elgato software gracefully releases the device when `usbipd attach` runs, or requires quitting the software first, is untested.

---

## All Sources

- https://github.com/abcminiuser/python-elgato-streamdeck
- https://python-elgato-streamdeck.readthedocs.io/en/stable/
- https://pypi.org/project/streamdeck/
- https://github.com/Julusian/node-elgato-stream-deck
- https://www.npmjs.com/package/@elgato-stream-deck/node
- https://github.com/elgatosf/streamdeck
- https://www.npmjs.com/package/@elgato/streamdeck
- https://pypi.org/project/streamdeck-sdk/
- https://github.com/gri-gus/streamdeck-python-sdk
- https://docs.elgato.com/sdk/plugins/architecture
- https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/
- https://docs.elgato.com/sdk/plugins/registration-procedure
- https://docs.elgato.com/sdk/plugins/events-sent
- https://docs.elgato.com/streamdeck/sdk/references/manifest/
- https://github.com/dorssel/usbipd-win
- https://github.com/dorssel/usbipd-win/wiki/WSL-support
- https://learn.microsoft.com/en-us/windows/wsl/connect-usb
- https://github.com/microsoft/WSL/issues/10526
- https://github.com/dorssel/usbipd-win/issues/646
- https://github.com/node-hid/node-hid/issues/249
- https://github.com/node-hid/node-hid/issues/456
- https://learn.microsoft.com/en-us/windows/wsl/networking
- https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- https://github.com/BarRaider/streamdeck-textfiletools
- https://marketplace.elgato.com/product/text-file-tools-8ed62b66-35f3-44fe-b801-486976ddd188
- https://github.com/mikepowell/streamdeck-commandline
- https://github.com/StartAutomating/ScriptDeck
- https://github.com/dorssel/usbipd-win/issues/861
- https://github.com/microsoft/WSL2-Linux-Kernel/releases
