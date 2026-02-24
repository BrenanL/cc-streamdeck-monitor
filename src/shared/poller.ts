/**
 * Shared polling module — one poll loop shared across all action instances.
 * All actions register a callback; they all get notified on each fetch.
 */
import { execFile } from "child_process";

const POLL_MS = 60_000;
const WSL_TIMEOUT_MS = 20_000;

// $HOME expanded by bash inside WSL2
const WSL_SCRIPT_CMD = 'python3 "$HOME/.local/share/claude-usage/get-usage.py" --json';

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

// ── Module-level state ────────────────────────────────────────────────────────

const listeners = new Set<UpdateCallback>();
let latestData: UsageData | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function fetchAndNotify(): void {
	execFile(
		"wsl.exe",
		["-e", "bash", "-c", WSL_SCRIPT_CMD],
		{ timeout: WSL_TIMEOUT_MS },
		(err, stdout) => {
			let data: UsageData;
			if (err) {
				const msg = err.killed ? "timed out" : (err.message || "unknown").slice(0, 60);
				data = { error: "wsl-error", message: msg };
			} else {
				try {
					data = JSON.parse((stdout || "").trim()) as UsageData;
				} catch {
					data = { error: "parse-error", message: "bad output from script" };
				}
			}
			latestData = data;
			for (const cb of listeners) cb(data);
		},
	);
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
	fetchAndNotify();
}
