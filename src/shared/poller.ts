/**
 * Shared polling module — one poll loop shared across all action instances.
 * All actions register a callback; they all get notified on each fetch.
 *
 * Platform behaviour:
 *   Windows  → calls wsl.exe to run get-usage.py inside WSL2
 *   macOS    → calls python3 directly (Stream Deck runs natively on macOS)
 */
import { execFile } from "child_process";

// How often (ms) the plugin invokes the Python script to check for activity.
// The script itself decides whether to make an API call or return cached data.
// Lower = faster detection of Claude Code activity, but more frequent process spawns.
const POLL_MS = 15_000;
const WSL_TIMEOUT_MS = 20_000;
const NATIVE_TIMEOUT_MS = 10_000;

// WSL2 (Windows): $HOME is expanded by bash inside WSL2
const WSL_SCRIPT_CMD = 'python3 "$HOME/.local/share/claude-usage/get-usage.py" --json';
const WSL_SCRIPT_CMD_FORCE = 'python3 "$HOME/.local/share/claude-usage/get-usage.py" --json --force';

// macOS: call python3 with the script path directly
const NATIVE_SCRIPT_PATH = `${process.env.HOME ?? "~"}/.local/share/claude-usage/get-usage.py`;

const IS_MAC = process.platform === "darwin";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Bucket {
	utilization: number;
	resets_in?: string;
	resets_at?: string;
}

export interface ExtraUsage {
	is_enabled: boolean;
	monthly_limit: number | null;
	used_credits: number | null;
	utilization: number | null;
}

export interface UsageData {
	five_hour?: Bucket | null;
	seven_day?: Bucket | null;
	seven_day_sonnet?: Bucket | null;
	extra_usage?: ExtraUsage | null;
	error?: string;
	message?: string;
}

export type UpdateCallback = (data: UsageData) => void;

/** Returns true if sonnet-specific data is present (not null/undefined). */
export function hasSonnetData(data: UsageData): boolean {
	return data.seven_day_sonnet != null;
}

// ── Module-level state ────────────────────────────────────────────────────────

const listeners = new Set<UpdateCallback>();
let latestData: UsageData | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function handleResult(err: (Error & { killed?: boolean }) | null, stdout: string, errorLabel: string): void {
	let data: UsageData;
	// Always try to parse stdout first — the script outputs valid JSON even on
	// non-zero exit (e.g. auth-error, http-429). Only fall back to the generic
	// errorLabel when stdout is missing or unparseable.
	const trimmed = (stdout || "").trim();
	if (trimmed) {
		try {
			data = JSON.parse(trimmed) as UsageData;
		} catch {
			if (err) {
				const msg = err.killed ? "timed out" : (err.message || "unknown").slice(0, 60);
				data = { error: errorLabel, message: msg };
			} else {
				data = { error: "parse-error", message: "bad output from script" };
			}
		}
	} else if (err) {
		const msg = err.killed ? "timed out" : (err.message || "unknown").slice(0, 60);
		data = { error: errorLabel, message: msg };
	} else {
		data = { error: "parse-error", message: "no output from script" };
	}
	latestData = data;
	for (const cb of listeners) cb(data);
}

function fetchAndNotify(force = false): void {
	if (IS_MAC) {
		const args = [NATIVE_SCRIPT_PATH, "--json"];
		if (force) args.push("--force");
		execFile(
			"python3",
			args,
			{ timeout: NATIVE_TIMEOUT_MS },
			(err, stdout) => handleResult(err, stdout, "python-error"),
		);
	} else {
		const cmd = force ? WSL_SCRIPT_CMD_FORCE : WSL_SCRIPT_CMD;
		execFile(
			"wsl.exe",
			["-e", "bash", "-c", cmd],
			{ timeout: WSL_TIMEOUT_MS },
			(err, stdout) => handleResult(err, stdout, "wsl-error"),
		);
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

export function addListener(cb: UpdateCallback): void {
	listeners.add(cb);
	if (!pollTimer) {
		fetchAndNotify();
		pollTimer = setInterval(fetchAndNotify, POLL_MS);
	} else if (latestData !== null) {
		// Deliver the latest cached state immediately so new buttons don't flash
		cb(latestData);
	}
}

export function removeListener(cb: UpdateCallback): void {
	listeners.delete(cb);
	if (listeners.size === 0 && pollTimer !== null) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

export function fetchNow(): void {
	fetchAndNotify(true);
}
