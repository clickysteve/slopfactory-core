import { i as readZip, r as createZip } from "./zip-CbX6Dxg3.js";
//#region src/storage/samples.ts
var StorageError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "StorageError";
	}
};
async function sha256Hex(bytes) {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new StorageError("unavailable", "This browser cannot fingerprint samples (no Web Crypto: the page must be served over https or from localhost).");
	const digest = await subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Build a StoredSample from file bytes. */
async function sampleFromBytes(bytes, name, type = "") {
	return {
		id: await sha256Hex(bytes),
		name,
		type,
		size: bytes.byteLength,
		added: Date.now(),
		bytes
	};
}
var meta = (s) => ({
	id: s.id,
	name: s.name,
	type: s.type,
	size: s.size,
	added: s.added
});
var MemorySampleStore = class {
	items = /* @__PURE__ */ new Map();
	/** set to simulate a full disk */
	quotaBytes = Infinity;
	async put(s) {
		const existing = this.items.get(s.id);
		if (existing) return meta(existing);
		if ([...this.items.values()].reduce((a, x) => a + x.size, 0) + s.size > this.quotaBytes) throw new StorageError("quota", "Browser storage is full: the sample was not saved.");
		this.items.set(s.id, {
			...s,
			bytes: s.bytes.slice(0)
		});
		return meta(s);
	}
	async get(id) {
		const s = this.items.get(id);
		return s ? {
			...s,
			bytes: s.bytes.slice(0)
		} : null;
	}
	async has(id) {
		return this.items.has(id);
	}
	async delete(id) {
		this.items.delete(id);
	}
	async list() {
		return [...this.items.values()].map(meta);
	}
};
function req(r) {
	return new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
function wrap(e) {
	const name = e?.name ?? "";
	if (name === "QuotaExceededError") return new StorageError("quota", "Browser storage is full: the sample was not saved. Free some space or remove unused samples.");
	return new StorageError("failed", `Browser storage failed: ${e?.message ?? name ?? "unknown error"}.`);
}
/** IndexedDB store: one database per application, one object store of samples. */
var IndexedDbSampleStore = class {
	dbName;
	factory;
	db = null;
	constructor(dbName, factory = globalThis.indexedDB ?? null) {
		this.dbName = dbName;
		this.factory = factory;
	}
	open() {
		if (!this.db) {
			const f = this.factory;
			if (!f) return Promise.reject(new StorageError("unavailable", "This browser has no IndexedDB, so samples cannot be kept between visits."));
			this.db = new Promise((resolve, reject) => {
				let r;
				try {
					r = f.open(this.dbName, 1);
				} catch (e) {
					reject(new StorageError("unavailable", `Browser storage is unavailable (${e.message}).`));
					return;
				}
				r.onupgradeneeded = () => {
					if (!r.result.objectStoreNames.contains("samples")) r.result.createObjectStore("samples", { keyPath: "id" });
				};
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(new StorageError("unavailable", `Browser storage is unavailable (${r.error?.message ?? "blocked"}).`));
				r.onblocked = () => reject(new StorageError("unavailable", "Browser storage is blocked by another tab."));
			});
			this.db.catch(() => this.db = null);
		}
		return this.db;
	}
	async tx(mode, fn) {
		const db = await this.open();
		try {
			const t = db.transaction("samples", mode);
			const result = await req(fn(t.objectStore("samples")));
			await new Promise((resolve, reject) => {
				t.oncomplete = () => resolve();
				t.onerror = () => reject(t.error);
				t.onabort = () => reject(t.error);
			});
			return result;
		} catch (e) {
			throw e instanceof StorageError ? e : wrap(e);
		}
	}
	async put(s) {
		const existing = await this.tx("readonly", (st) => st.get(s.id));
		if (existing) return meta(existing);
		await this.tx("readwrite", (st) => st.put(s));
		return meta(s);
	}
	async get(id) {
		return await this.tx("readonly", (st) => st.get(id)) ?? null;
	}
	async has(id) {
		return await this.tx("readonly", (st) => st.count(id)) > 0;
	}
	async delete(id) {
		await this.tx("readwrite", (st) => st.delete(id));
	}
	async list() {
		return (await this.tx("readonly", (st) => st.getAll())).map(meta);
	}
};
//#endregion
//#region src/storage/bundle.ts
/**
* Portable project bundles: one ZIP holding an application's project file and every sample it
* references, so a project can move between computers with its audio. Each sample is stored
* once (by content hash) however many times the project uses it, and hashes are checked on
* import. The project file itself is the application's business: Core only carries it.
*
*   manifest.json        { format, version, app, project, samples: [{ id, name, type, size, file }] }
*   <project file name>  the application's project document
*   samples/<id>.<ext>   original sample bytes
*/
var BUNDLE_FORMAT = "slopfactory-bundle";
var BUNDLE_VERSION = 1;
var ext = (name) => {
	const m = /\.([A-Za-z0-9]{1,5})$/.exec(name);
	return m ? m[1].toLowerCase() : "bin";
};
function writeBundle(app, projectFile, samples) {
	const unique = /* @__PURE__ */ new Map();
	for (const s of samples) if (!unique.has(s.id)) unique.set(s.id, s);
	const list = [...unique.values()].map((s) => ({
		id: s.id,
		name: s.name,
		type: s.type,
		size: s.size,
		file: `samples/${s.id}.${ext(s.name)}`
	}));
	const manifest = {
		format: BUNDLE_FORMAT,
		version: 1,
		app,
		project: projectFile.name,
		samples: list
	};
	const enc = new TextEncoder();
	return createZip([
		{
			name: "manifest.json",
			data: enc.encode(JSON.stringify(manifest, null, 1))
		},
		{
			name: projectFile.name,
			data: enc.encode(projectFile.text)
		},
		...list.map((m) => ({
			name: m.file,
			data: new Uint8Array(unique.get(m.id).bytes)
		}))
	]);
}
async function readBundle(bytes, app) {
	let files;
	try {
		files = await readZip(bytes);
	} catch (e) {
		throw new Error(`This is not a readable project bundle (${e.message}).`);
	}
	const byName = new Map(files.map((f) => [f.name, f.data]));
	const mf = byName.get("manifest.json");
	if (!mf) throw new Error("This ZIP is not a project bundle (no manifest.json).");
	let manifest;
	try {
		manifest = JSON.parse(new TextDecoder().decode(mf));
	} catch {
		throw new Error("The bundle manifest is damaged.");
	}
	if (manifest.format !== "slopfactory-bundle") throw new Error("This ZIP is not a project bundle.");
	if (!(manifest.version >= 1) || manifest.version > 1) throw new Error(`This bundle was written by a newer version (bundle format ${manifest.version}).`);
	if (manifest.app !== app) throw new Error(`This bundle belongs to ${manifest.app}, not ${app}.`);
	const proj = byName.get(manifest.project);
	if (!proj) throw new Error("The bundle has no project file.");
	const problems = [];
	const samples = [];
	for (const m of Array.isArray(manifest.samples) ? manifest.samples : []) {
		const data = byName.get(m.file);
		if (!data) {
			problems.push(`Sample "${m.name}" is missing from the bundle.`);
			continue;
		}
		const id = await sha256Hex(data);
		if (id !== m.id) {
			problems.push(`Sample "${m.name}" is damaged (its contents do not match its fingerprint).`);
			continue;
		}
		samples.push({
			id,
			name: m.name,
			type: m.type ?? "",
			size: data.length,
			added: Date.now(),
			bytes: data.slice().buffer
		});
	}
	return {
		manifest,
		projectText: new TextDecoder().decode(proj),
		samples,
		problems
	};
}
//#endregion
export { IndexedDbSampleStore as a, sampleFromBytes as c, writeBundle as i, sha256Hex as l, BUNDLE_VERSION as n, MemorySampleStore as o, readBundle as r, StorageError as s, BUNDLE_FORMAT as t };
