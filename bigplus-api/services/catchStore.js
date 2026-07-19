const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CATCHES_FILE = path.join(DATA_DIR, "catches.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CATCHES_FILE)) fs.writeFileSync(CATCHES_FILE, "[]\n", "utf8");
}

function readCatches() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(CATCHES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeCatches(catches) {
  ensureDataFile();
  fs.writeFileSync(CATCHES_FILE, `${JSON.stringify(catches, null, 2)}\n`, "utf8");
}

module.exports = {
  readCatches,
  writeCatches
};
