//#region src/export/names.ts
/** File-name helpers: short, predictable, safe on every operating system. */
/** Lower-case letters, digits and single hyphens, at most `max` characters ('' if nothing is left). */
function slug(s, max = 24) {
	return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
/** Join name parts with underscores, dropping empty ones. */
function fileName(parts, ext) {
	return `${parts.filter(Boolean).join("_")}.${ext}`;
}
/** Make names unique by appending -2, -3... before the extension. */
function uniqueNames(names) {
	const seen = /* @__PURE__ */ new Map();
	return names.map((n) => {
		const c = (seen.get(n) ?? 0) + 1;
		seen.set(n, c);
		if (c === 1) return n;
		const dot = n.lastIndexOf(".");
		return dot > 0 ? `${n.slice(0, dot)}-${c}${n.slice(dot)}` : `${n}-${c}`;
	});
}
//#endregion
export { slug as n, uniqueNames as r, fileName as t };
