const DEFAULT_BASE_URL = "http://localhost:9010";
const CREATE_CONST_MAP_ALIAS = "createConstMap$1(";
const CREATE_CONST_MAP_DEF = "function createConstMap(";
const CREATE_CONST_MAP_ALIAS_DEF = "function createConstMap$1(";

const baseUrl = process.argv[2] ?? DEFAULT_BASE_URL;
const seen = new Set();

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return await response.text();
};

const extractModuleScriptUrl = (html) => {
  const match = html.match(/<script[^>]+src="([^"]+\.js)"/i);
  if (match === null) {
    throw new Error("Could not find module script in index.html");
  }

  return new URL(match[1], baseUrl).toString();
};

const extractImports = (code, parentUrl) => {
  const imports = new Set();
  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        imports.add(new URL(specifier, parentUrl).toString());
      }
    }
  }

  return [...imports];
};

const walkJsGraph = async (entryUrl) => {
  const queue = [entryUrl];
  const files = [];

  while (queue.length > 0) {
    const currentUrl = queue.shift();
    if (currentUrl === undefined || seen.has(currentUrl)) {
      continue;
    }

    seen.add(currentUrl);
    const code = await fetchText(currentUrl);
    files.push({ url: currentUrl, code });

    for (const childUrl of extractImports(code, currentUrl)) {
      if (!seen.has(childUrl)) {
        queue.push(childUrl);
      }
    }
  }

  return files;
};

const html = await fetchText(baseUrl);
const entryUrl = extractModuleScriptUrl(html);
const files = await walkJsGraph(entryUrl);

const offendingFile = files.find(({ code }) => {
  return (
    code.includes(CREATE_CONST_MAP_ALIAS) &&
    code.includes(CREATE_CONST_MAP_DEF) &&
    !code.includes(CREATE_CONST_MAP_ALIAS_DEF)
  );
});

if (offendingFile === undefined) {
  console.error("Did not find a bundled asset with the expected createConstMap mismatch.");
  process.exit(1);
}

console.log(`Found mismatch in ${offendingFile.url}`);
console.log(`Pattern present: ${CREATE_CONST_MAP_ALIAS}`);
console.log(`Definition present: ${CREATE_CONST_MAP_DEF}`);
