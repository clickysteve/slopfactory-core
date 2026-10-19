/**
 * Moving an application's older kit and sample data into its kit library, safely:
 *
 * - A migration only **reads** the old data and **adds** to the library. The old data is never
 *   changed or deleted, so a failed or interrupted migration loses nothing, and the old
 *   version of the application still finds everything where it was.
 * - A migration is recorded as done only when it completes; until then it runs again at the
 *   next start (so it must be safe to repeat: record each item as it is migrated with `step`).
 * - A failure is returned, not thrown, so the application can start and say what happened.
 */
import type { KitLibrary } from './library';

export interface MigrationReport {
  /** it ran now (false: it had already completed) */
  ran: boolean;
  /** items migrated this time */
  migrated: number;
  /** items that could not be migrated (they are left in the old storage) */
  problems: string[];
  /** a failure that stopped the migration (it will run again next time) */
  error?: string;
}

export interface MigrationContext {
  /** run `fn` once for `item` (across interrupted runs), counting it as migrated */
  step(item: string, fn: () => Promise<void>): Promise<boolean>;
  problem(message: string): void;
}

/**
 * Run a migration once. `id` names it ('legacy-kits-v1'); `run` does the work through `step`.
 * Recorded under the library's application values (`migration:<id>`).
 */
export async function migrateOnce(library: KitLibrary, id: string, run: (m: MigrationContext) => Promise<void>): Promise<MigrationReport> {
  const report: MigrationReport = { ran: false, migrated: 0, problems: [] };
  if (!library.persistent) return report;
  try {
    if (await library.getMeta(`migration:${id}`)) return report;
    report.ran = true;
    const done = new Set((await library.getMeta<string[]>(`migration:${id}:items`)) ?? []);
    await run({
      step: async (item, fn) => {
        if (done.has(item)) return false;
        try {
          await fn();
        } catch (e) {
          report.problems.push(`${item}: ${e instanceof Error ? e.message : String(e)}`);
          return false;
        }
        done.add(item);
        report.migrated++;
        await library.setMeta(`migration:${id}:items`, [...done]);
        return true;
      },
      problem: (m) => report.problems.push(m),
    });
    // complete only when nothing was left behind: otherwise the rest is tried again next time
    if (!report.problems.length) await library.setMeta(`migration:${id}`, { at: Date.now(), migrated: done.size });
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}
