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

/**
 * arduino-cli requires the sketch folder to contain a `.ino` whose base name
 * matches the folder. Pick that name from the files we were given: prefer a
 * top-level `.ino`, fall back to the caller-supplied name, then "sketch".
 */
function resolveSketchName(
  files: Record<string, string>,
  sketchName?: string
): string {
  const topLevelIno = Object.keys(files).find(
    (rel) => !rel.includes("/") && rel.toLowerCase().endsWith(".ino")
  );
  const raw =
    (topLevelIno && topLevelIno.replace(/\.ino$/i, "")) ||
    sketchName ||
    "sketch";
  // Strip anything arduino-cli/the filesystem would choke on.
  const safe = raw.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return safe || "sketch";
}

/**
 * Write an in-memory sketch (`{ relativePath: content }`) to a fresh OS temp
 * directory so arduino-cli has a real path to compile/upload. Used by the web
 * build, which can't hand the service a real on-disk path. The files are placed
 * under a folder named after the sketch's main .ino, e.g.
 *   <tmp>/tinyservice-XXXX/fade/fade.ino
 */
export async function materializeSketch(
  files: Record<string, string>,
  sketchName?: string
): Promise<MaterializedSketch> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "tinyservice-"));
  const folderName = resolveSketchName(files, sketchName);
  const sketchPath = join(tmpRoot, folderName);
  await mkdir(sketchPath, { recursive: true });

  for (const [rel, content] of Object.entries(files)) {
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
    `Materialized ${Object.keys(files).length} file(s) to ${sketchPath}`
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
