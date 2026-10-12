# Releasing

Core is distributed as **immutable git tags** of this repository. There is no npm registry
release and no GitHub Release: applications install a tag directly with npm.

## Versioning

Semantic versioning, starting at `0.1.0`:

* **patch** (`0.1.x`): fixes that change no public interface and no audio output that an
  application relies on.
* **minor** (`0.x.0`): new features, or (while the major version is 0) any change an
  application has to adapt to. Behaviour that changes existing projects' sound is never made
  the default; it is opt-in (for example, choke groups only act on notes that ask for them).
* **major** (`1.0.0` and later): breaking changes, once the interfaces are considered stable.

The version lives in `package.json` and `src/version.ts` (`CORE_VERSION`); a unit test fails
if they differ. Every release is recorded in `CHANGELOG.md`.

## Why `dist/` is committed

npm installs a git dependency by packing the repository at the requested commit. A committed,
reproducible build means installation needs no build step, no dev dependencies and no
particular TypeScript version on the installing machine. `npm run check:dist` rebuilds and
fails if `dist/` differs from what is committed (CI runs it), so the build output always
matches the source.

## Making a release

1. Make and test the change: `npm run verify` (typecheck, unit tests, build, browser tests).
2. Set the new version in `package.json`, `package-lock.json` (`npm version --no-git-tag-version X.Y.Z`
   does both) and `src/version.ts`.
3. `npm run build`, then `npm run check:dist` must pass after committing.
4. Add a `CHANGELOG.md` entry.
5. Commit, then create an **annotated tag** on that commit and push both:

   ```bash
   git tag -a vX.Y.Z -m "@slopfactory/core X.Y.Z"
   git push origin <branch> vX.Y.Z
   ```

6. **Never move or delete a pushed tag.** A mistake is fixed by a new patch version.

## Upgrading an application

```bash
npm install "git+https://github.com/clickysteve/slopfactory-core.git#vX.Y.Z"
npm run verify        # or the application's full test command
git add package.json package-lock.json
git commit -m "Update @slopfactory/core to X.Y.Z"
```

`package.json` names the tag; `package-lock.json` pins the tag's commit SHA, so `npm ci` installs
exactly the same code everywhere. Each application upgrades deliberately and runs its own
regression tests; two applications may briefly be on different versions, but a release that
one application needs is adopted by the others before their next release.

Check which version an application has: `npm ls @slopfactory/core`, or `CORE_VERSION` at run
time.

## Developing Core and an application together

Use a temporary link while working (`npm link` in Core, `npm link @slopfactory/core` in the
application), then release a tag and install it before committing the application. Never
commit a `file:` path, a branch name or a link.
