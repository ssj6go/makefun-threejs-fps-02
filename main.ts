// EMBERLINE entrypoint: copies the game and its screenshots into the output
// directory and writes the dossier the judges read. Uses the kit helper, which
// expects MAKEFUN_OUTPUT_DIR (or a --out flag) and a project root.
import { build } from "./vendor/makefun-threejs.ts";

await build({ root: import.meta.dirname });
