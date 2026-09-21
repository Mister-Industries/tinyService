import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, posix } from "path";
import { logger } from "../config.js";

/**
 * A sketch materialized to a real folder on disk, ready for arduino-cli, plus a
 * cleanup that removes the temp tree once the build/upload is done.
 */
export interface MaterializedSketch {
  /** Absolute path to the sketch folder (the dir that holds the main .ino). */
  sketchPath: string;
  /** Remove the temp tree. Safe to call once; errors are swallowed + logged. */
  cleanup: () => Promise<void>;
}

const INO = /\.ino$/i;

/** Top-level `.ino` files, in the order the client sent them. */
function topLevelInos(files: Record<string, string>): string[] {
  return Object.keys(files).filter(
    (rel) => !rel.includes("/") && INO.test(rel)
  );
}

/**
 * Coerce free text into a name arduino-cli accepts for a sketch folder.
 *
 * This mirrors tinyStudio's `toSketchName` (src/renderer/src/lib/
 * projectLayout.ts) on purpose: `-` and `.` are legal in a sketch name, and a
 * stricter rule here renamed the folder without renaming the .ino inside it,
 * so `blink-alternate/` ended up holding `blink-alternate.ino` while
 * arduino-cli looked for `blink_alternate.ino` and reported "main file missing
 * from sketch". `materializeSketch` now renames the main .ino to match as
 * well, so the two can't drift apart whatever this returns.
 */
export function sanitizeSketchName(raw: string): string {
  return raw
    .trim()
    .replace(INO, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 63);
}

/**
 * arduino-cli requires the sketch folder to contain a `.ino` whose base name
 * matches the folder. Pick that name from the files we were given: prefer a
 * top-level `.ino` (the one the caller named, if it's there), fall back to the
 * caller-supplied name, then "sketch".
 */
export function resolveSketch(
  files: Record<string, string>,
  sketchName?: string
): { folderName: string; mainIno?: string } {
  const inos = topLevelInos(files);
  const named =
    sketchName && inos.find((rel) => rel.replace(INO, "") === sketchName);
  const mainIno = named || inos[0];
  const raw = mainIno ? mainIno.replace(INO, "") : sketchName || "sketch";
  return { folderName: sanitizeSketchName(raw) || "sketch", mainIno };
}

/**
 * Write an in-memory sketch (`{ relativePath: content }`) to a fresh OS temp
 * directory so arduino-cli has a real path to compile/upload. Used by the web
 * build, which can't hand the service a real on-disk path. The files are placed
 * under a folder named after the sketch's main .ino, e.g.
 *   <tmp>/tinyservice-XXXX/fade/fade.ino
 *
 * If sanitizing changed the name, the main .ino is renamed along with the
 * folder so the two always agree; every other file keeps its relative path.
 */
export async function materializeSketch(
  files: Record<string, string>,
  sketchName?: string
): Promise<MaterializedSketch> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "tinyservice-"));
  const { folderName, mainIno } = resolveSketch(files, sketchName);
  const sketchPath = join(tmpRoot, folderName);
  await mkdir(sketchPath, { recursive: true });

  // Keep the main .ino named after the folder. Skipped when a file of that
  // name is already there: overwriting one of the user's files would be worse
  // than the sketch failing to open.
  const wanted = `${folderName}.ino`;
  let toWrite = files;
  if (mainIno && mainIno !== wanted && !(wanted in files)) {
    toWrite = { ...files, [wanted]: files[mainIno] };
    delete toWrite[mainIno];
    logger.info(`Renamed main sketch file ${mainIno} to ${wanted}`);
  }

  for (const [rel, content] of Object.entries(toWrite)) {
    // Normalize separators and refuse anything that escapes the sketch folder.
    const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.split("/").some((seg) => seg === "" || seg === "..")) {
      throw new Error(`Unsafe path in sketch files: ${rel}`);
    }
    const dest = join(sketchPath, ...posix.normalize(normalized).split("/"));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
  }

  logger.info(
    `Materialized ${Object.keys(toWrite).length} file(s) to ${sketchPath}`
  );

  return {
    sketchPath,
    cleanup: async () => {
      try {
        await rm(tmpRoot, { recursive: true, force: true });
      } catch (error) {
        logger.error(`Failed to clean up temp sketch dir ${tmpRoot}:`, error);
      }
    },
  };
}
