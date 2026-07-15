const executableFenceLanguages = new Set([
  "bash",
  "javascript",
  "js",
  "shell",
  "sh",
  "ts",
  "typescript",
]);

export function extractReadmeFences(readme) {
  if (typeof readme !== "string") throw new TypeError("README contents must be a string");
  const lines = readme.split(/\r?\n/u);
  const fences = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^```([^`]*)$/u.exec(lines[index]);
    if (!opening) continue;
    const info = opening[1].trim();
    const language = (info.split(/\s+/u)[0] ?? "").toLowerCase();
    const codeLines = [];
    let closingIndex = index + 1;
    while (closingIndex < lines.length && !/^```[ \t]*$/u.test(lines[closingIndex])) {
      codeLines.push(lines[closingIndex]);
      closingIndex += 1;
    }
    if (closingIndex === lines.length) {
      throw new Error(`unclosed README fence beginning on line ${index + 1}`);
    }
    fences.push(Object.freeze({
      code: `${codeLines.join("\n")}\n`,
      executable: executableFenceLanguages.has(language),
      info,
      language,
      line: index + 1,
    }));
    index = closingIndex;
  }

  return Object.freeze(fences);
}
