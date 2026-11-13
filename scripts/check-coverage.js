// Checks the coverage report written by the unit gate against coverage-thresholds.json.
import { readFileSync } from "node:fs";

const thresholds = JSON.parse(readFileSync("coverage-thresholds.json", "utf8"));
const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));

if (total.lines.total === 0) {
  console.error("coverage: no lines measured");
  process.exit(1);
}

let failed = false;
for (const [metric, minimum] of Object.entries(thresholds)) {
  const { pct } = total[metric];
  const ok = pct >= minimum;
  console.log(`${ok ? "ok" : "FAIL"} ${metric}: ${pct}% (minimum ${minimum}%)`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
