
import fs from "fs";
import path from "path";
import chalk from "chalk"; // Optional: for colored console output

// Optional: log file path
const LOG_FILE_PATH = path.join(process.cwd(), "logs.txt");

// Ensure logs file exists
if (!fs.existsSync(LOG_FILE_PATH)) {
  fs.writeFileSync(LOG_FILE_PATH, "");
}

const formatDate = () => new Date().toISOString();

const writeToFile = (message) => {
  fs.appendFile(LOG_FILE_PATH, message + "\n", (err) => {
    if (err) console.error("Failed to write log to file:", err);
  });
};

export const logger = {
  info: (msg) => {
    const formatted = `[INFO] [${formatDate()}] ${msg}`;
    console.log(chalk.blue(formatted));
    writeToFile(formatted);
  },

  warn: (msg) => {
    const formatted = `[WARN] [${formatDate()}] ${msg}`;
    console.warn(chalk.yellow(formatted));
    writeToFile(formatted);
  },

  error: (msg) => {
    const formatted = `[ERROR] [${formatDate()}] ${msg}`;
    console.error(chalk.red(formatted));
    writeToFile(formatted);
  },

  debug: (msg) => {
    const formatted = `[DEBUG] [${formatDate()}] ${msg}`;
    console.log(chalk.green(formatted));
    // Optional: write debug logs to file as well
    // writeToFile(formatted);
  },
};

