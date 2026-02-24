/**
 * Shared SVG rendering helpers used by all action types.
 */
import type { ExtraUsage, UsageData } from "./poller.js";

// ── Utilities ─────────────────────────────────────────────────────────────────

export function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function encode(svgContent: string): string {
	return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
}

export function svg(inner: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">` +
		`<rect width="72" height="72" fill="#0d1117"/>` +
		`<style>` +
		`.lbl{text-anchor:middle;fill:#555555;font-size:9px;font-family:sans-serif}` +
		`.dim{text-anchor:middle;fill:#666666;font-size:9px;font-family:monospace,sans-serif}` +
		`</style>` +
		inner +
		`</svg>`
	);
}

// ── Extra usage overlay ───────────────────────────────────────────────────────

/**
 * Small orange badge in the top-right corner when extra usage is active.
 */
export function extraBadge(extra: ExtraUsage | null | undefined): string {
	if (!extra?.is_enabled) return "";
	const label =
		extra.used_credits != null
			? `$${extra.used_credits.toFixed(2)}`
			: "EXTRA";
	return (
		`<text x="70" y="7" text-anchor="end" ` +
		`fill="#ff8800" font-size="7" font-family="sans-serif" font-weight="bold">${esc(label)}</text>`
	);
}

// ── Common full-button states ─────────────────────────────────────────────────

export function svgLoading(): string {
	return svg(
		`<text x="36" y="40" text-anchor="middle" dominant-baseline="middle" ` +
		`fill="#555555" font-size="11" font-family="sans-serif">loading\u2026</text>`,
	);
}

export function svgError(data: UsageData): string {
	const code = data.error || "error";
	const isAuth = code === "auth-error";
	return svg(
		`<text x="36" y="26" text-anchor="middle" ` +
		`fill="#ff4444" font-size="10" font-family="sans-serif">${esc(code)}</text>` +
		`<text x="36" y="44" class="dim">${isAuth ? "open Claude Code" : "retrying\u2026"}</text>` +
		`<text x="36" y="58" class="dim">press to retry</text>`,
	);
}

// ── Meter bar helper (used by stacked view) ───────────────────────────────────

/**
 * Render a labeled horizontal progress bar.
 * @param y  Baseline y position for the label text.
 */
export function meterRow(y: number, label: string, pct: number, color: string): string {
	const barX = 16;
	const barWidth = 42;
	const filledWidth = Number(((barWidth * Math.min(pct, 100)) / 100).toFixed(1));
	return (
		`<text x="4" y="${y}" fill="#555" font-size="8" font-family="sans-serif" ` +
		`dominant-baseline="auto">${esc(label)}</text>` +
		`<rect x="${barX}" y="${y - 7}" width="${barWidth}" height="7" rx="1" fill="#1a1a1a"/>` +
		`<rect x="${barX}" y="${y - 7}" width="${filledWidth}" height="7" rx="1" fill="${color}"/>` +
		`<text x="62" y="${y}" fill="#888" font-size="8" font-family="monospace" ` +
		`text-anchor="end" dominant-baseline="auto">${pct}%</text>`
	);
}

// ── Page indicator dots (used by toggle view) ────────────────────────────────

/**
 * Three small dots: the active one is white, inactive are dimmed.
 */
export function pageDots(active: number): string {
	const dots = [0, 1, 2].map((i) => {
		const cx = 27 + i * 9;
		const fill = i === active ? "#cccccc" : "#333333";
		return `<circle cx="${cx}" cy="7" r="2.5" fill="${fill}"/>`;
	});
	return dots.join("");
}
