// Übernimmt data/network.json (Quelle: tools/build.py) in die App. Einzige Datenquelle bleibt data/.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "../src/data"), { recursive: true });
copyFileSync(join(here, "../../data/network.json"), join(here, "../src/data/network.json"));
console.log("data/network.json → web/src/data/network.json");
