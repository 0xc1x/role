import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const MOBILE_PROJECT = fileURLToPath(new URL("../apps/mobile/", import.meta.url));
const DUPLICATE_CHECK = "Check that no duplicate dependencies are installed";
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const BUN_STORE_PATTERN = /(?:^|[\\/])\.bun[\\/]/m;
const UNEXPECTED_ERROR_PATTERN = /Unexpected error while running/u;
const DUPLICATE_HEADING_PATTERN = /^Found duplicates for ([^\s:]+):$/u;
const DUPLICATE_ENTRY_PATTERN =
  /^\s*[├└]─\s+((?:@[^/\s@]+\/)?[^@\s]+)@([^\s]+)\s+\(at:\s+(.+)\)\s*$/u;
const TREE_LINE_PATTERN = /^\s*(?:│\s*)?[├└]─/u;
const LINKED_LINE_PATTERN = /^\s*(?:│\s*)?└─ linked to\b/u;

export function isKnownBunDuplicateFalsePositive(output) {
  const normalized = output.replace(ANSI_PATTERN, "");

  if (UNEXPECTED_ERROR_PATTERN.test(normalized)) return false;

  const failedCount = normalized.match(/\b(\d+) checks? failed\b/u)?.[1];
  if (failedCount !== "1") return false;

  const failedChecks = normalized
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*✖\s+(.+?)\s*$/u)?.[1])
    .filter(Boolean);
  if (failedChecks.length !== 1 || failedChecks[0] !== DUPLICATE_CHECK) return false;
  if (!BUN_STORE_PATTERN.test(normalized)) return false;

  const lines = normalized.split(/\r?\n/u);
  const headings = lines.flatMap((line, index) => {
    const match = line.match(DUPLICATE_HEADING_PATTERN);
    return match ? [{ index, packageName: match[1] }] : [];
  });
  if (headings.length === 0) return false;

  return headings.every((heading, headingIndex) => {
    const end =
      headings[headingIndex + 1]?.index ??
      lines.findIndex(
        (line, index) =>
          index > heading.index && line.trim() === "Advice:",
      );
    const sectionEnd = end === -1 ? lines.length : end;
    const sectionLines = lines.slice(heading.index + 1, sectionEnd);
    const entries = sectionLines
      .map((line) => line.match(DUPLICATE_ENTRY_PATTERN))
      .filter(Boolean);
    const treeLineCount = sectionLines.filter((line) =>
      TREE_LINE_PATTERN.test(line),
    ).length;
    const linkedLineCount = sectionLines.filter((line) =>
      LINKED_LINE_PATTERN.test(line),
    ).length;

    if (entries.length < 2) return false;
    if (entries.length + linkedLineCount !== treeLineCount) return false;
    if (entries.some((entry) => entry[1] !== heading.packageName)) return false;
    return new Set(entries.map((entry) => entry[2])).size === 1;
  });
}

function runExpoDoctor() {
  return new Promise((resolve) => {
    const child = spawn("bunx", ["expo-doctor"], {
      cwd: MOBILE_PROJECT,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    let spawnError = null;

    for (const [source, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      source.on("data", (chunk) => {
        output += chunk;
        destination.write(chunk);
      });
    }

    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, output, signal, spawnError });
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { exitCode, output, signal, spawnError } = await runExpoDoctor();

  if (spawnError) {
    console.error(`Failed to run Expo Doctor: ${spawnError.message}`);
    process.exitCode = 1;
  } else if (signal) {
    console.error(`Expo Doctor terminated by signal ${signal}.`);
    process.exitCode = 1;
  } else if (exitCode === 0) {
    process.exitCode = 0;
  } else if (isKnownBunDuplicateFalsePositive(output)) {
    // Upstream false positive for Bun isolated peer dependency layouts:
    // https://github.com/expo/expo/issues/41984
    console.warn(
      "Warning: Accepted the known Expo Doctor Bun workspace false positive because all reported duplicate entries have identical versions. See https://github.com/expo/expo/issues/41984",
    );
    process.exitCode = 0;
  } else {
    console.error(
      "Expo Doctor failed for a reason other than the accepted Bun same-version duplicate false positive.",
    );
    process.exitCode = exitCode;
  }
}
