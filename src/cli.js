import path from "node:path";
import { parseArgs } from "node:util";

import { resolveDefaultLogPath, runExamLog } from "./exam-log.js";

function printHelp() {
  const defaultPath = resolveDefaultLogPath();
  process.stdout.write(
    [
      "dr-exam-log",
      "",
      "Usage:",
      "  dr-exam-log [--interval-seconds <number>] [--output <file>]",
      "",
      "Options:",
      "  -i, --interval-seconds  Polling interval in seconds (default: 1.0, min: 0.2)",
      `  -o, --output            Log file path (default: ${defaultPath})`,
      "  -h, --help              Show this help",
      "",
      "Examples:",
      "  dr-exam-log",
      "  dr-exam-log -i 0.5",
      "  dr-exam-log -o C:\\Users\\Public\\Downloads\\proctor_state_transitions.log",
      "",
    ].join("\n"),
  );
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "interval-seconds": {
        type: "string",
        short: "i",
      },
      output: {
        type: "string",
        short: "o",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    return { help: true };
  }

  let intervalSeconds = 1;
  if (values["interval-seconds"] !== undefined) {
    intervalSeconds = Number(values["interval-seconds"]);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      throw new Error("--interval-seconds must be a positive number");
    }
  }

  const outputPath = values.output ? path.resolve(values.output) : undefined;
  return {
    help: false,
    intervalSeconds,
    outputPath,
  };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      printHelp();
      return;
    }

    await runExamLog({
      intervalSeconds: args.intervalSeconds,
      outputPath: args.outputPath,
    });
  } catch (error) {
    process.stderr.write(`[ERROR] ${error?.message ?? String(error)}\n`);
    process.stderr.write("Run dr-exam-log --help for usage.\n");
    process.exitCode = 1;
  }
}
