// trav-api/utils/horseParser.js

function parseHorseText(rawText = '', gameType = '') {
  const cleaned = rawText.replace(/\r\n/g, '\n').trim();
  if (!cleaned) {
    return {
      header: null,
      divisions: [],
      expectedDivisions: getExpectedDivisions(gameType),
    };
  }

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      header: null,
      divisions: [],
      expectedDivisions: getExpectedDivisions(gameType),
    };
  }

  const header = lines[0];
  const divisions = [];
  let currentDivIndex = 1;
  let currentDiv = { index: currentDivIndex, horses: [] };
  divisions.push(currentDiv);

  let prevNumber = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\d+)\s+/); // siffror i början
    if (!match) continue;

    const num = parseInt(match[1], 10);

    if (prevNumber !== null && num < prevNumber) {
      currentDivIndex += 1;
      currentDiv = { index: currentDivIndex, horses: [] };
      divisions.push(currentDiv);
    }

    currentDiv.horses.push({
      number: num,
      rawLine: line,
      scratched: false,
    });

    prevNumber = num;
  }

  // Markera strukna (saknade nummer)
  divisions.forEach((div) => {
    if (!div.horses.length) return;
    const nums = div.horses.map((h) => h.number);
    const max = Math.max(...nums);
    const existing = new Set(nums);

    const placeholders = [];
    for (let n = 1; n <= max; n++) {
      if (!existing.has(n)) {
        placeholders.push({
          number: n,
          rawLine: null,
          scratched: true,
        });
      }
    }

    div.horses = [...div.horses, ...placeholders].sort(
      (a, b) => a.number - b.number
    );
  });

  return {
    header,
    divisions,
    expectedDivisions: getExpectedDivisions(gameType),
  };
}

function getExpectedDivisions(gameType) {
  if (!gameType) return null;
  const digitsMatch = String(gameType).match(/\d+/);
  if (!digitsMatch) return null;
  const firstDigit = digitsMatch[0][0]; // bara första siffran
  const n = parseInt(firstDigit, 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = { parseHorseText };
