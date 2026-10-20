
const fs = require("fs");
const path = require("path");

const htmlDirectory = path.resolve(
  __dirname,
  "../../reference-docs/docs/docs/schemes"
);

const jsonPath = path.resolve(
  __dirname,
  "../data/schemes.json"
);

const outputPath = path.resolve(
  __dirname,
  "../data/scheme-html-preview.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getExistingSchemes(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.schemes)) return data.schemes;
  if (Array.isArray(data.data)) return data.data;

  throw new Error(
    "Unexpected schemes.json format. No scheme array found."
  );
}

function decodeBasicEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getMetaContent(html, key, attribute = "name") {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `<meta\\b(?=[^>]*\\b${attribute}\\s*=\\s*["']${escapedKey}["'])[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*>`,
    "i"
  );

  const match = html.match(regex);
  return match ? decodeBasicEntities(match[1].trim()) : "";
}

function extractJsonLd(html) {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];

      const service = items.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item["@type"] === "GovernmentService" ||
            item.name ||
            item.description)
      );

      if (service) return service;
    } catch {
      // Ignore invalid JSON-LD blocks and try the next one.
    }
  }

  return null;
}

function main() {
  if (!fs.existsSync(htmlDirectory)) {
    throw new Error(`HTML directory not found: ${htmlDirectory}`);
  }

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Schemes JSON not found: ${jsonPath}`);
  }

  const existingData = readJson(jsonPath);
  const existingSchemes = getExistingSchemes(existingData);

  const existingBySlug = new Map(
    existingSchemes.map((scheme) => [
      String(scheme.slug || "").toLowerCase(),
      scheme,
    ])
  );

  const files = fs
    .readdirSync(htmlDirectory)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .sort();

  const results = files.map((file) => {
    const slug = path.basename(file, ".html").toLowerCase();
    const html = fs.readFileSync(
      path.join(htmlDirectory, file),
      "utf8"
    );

    const structuredData = extractJsonLd(html);
    const existing = existingBySlug.get(slug);

    return {
      slug,
      sourceFile: file,
      matchedExistingRecord: Boolean(existing),
      existingName: existing?.name || null,

      htmlDetails: {
        pageTitle: getMetaContent(html, "og:title", "property"),
        metaDescription: getMetaContent(html, "description"),
        name: structuredData?.name || "",
        alternateName: structuredData?.alternateName || "",
        description: structuredData?.description || "",
        provider:
          typeof structuredData?.provider === "object"
            ? structuredData.provider.name || ""
            : structuredData?.provider || "",
        officialUrl: structuredData?.url || "",
      },

      structuredDataFound: Boolean(structuredData),
    };
  });

  const matched = results.filter(
    (item) => item.matchedExistingRecord
  );
  const unmatched = results.filter(
    (item) => !item.matchedExistingRecord
  );
  const withoutStructuredData = results.filter(
    (item) => !item.structuredDataFound
  );

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    databaseUpdated: false,
    htmlFilesFound: files.length,
    existingJsonRecords: existingSchemes.length,
    matchedRecords: matched.length,
    unmatchedRecords: unmatched.map((item) => item.slug),
    filesWithoutStructuredData: withoutStructuredData.map(
      (item) => item.slug
    ),
    results,
  };

  fs.writeFileSync(
    outputPath,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("\n=== SCHEME HTML IMPORT PREVIEW ===");
  console.log(`HTML files found: ${report.htmlFilesFound}`);
  console.log(`Existing JSON records: ${report.existingJsonRecords}`);
  console.log(`Matched records: ${report.matchedRecords}`);
  console.log(`Unmatched HTML files: ${unmatched.length}`);
  console.log(
    `Files without structured data: ${withoutStructuredData.length}`
  );
  console.log(`\nPreview saved to:\n${outputPath}`);
  console.log("\nDRY RUN ONLY — MongoDB was not modified.");
}

try {
  main();
} catch (error) {
  console.error("\nImport preview failed:", error.message);
  process.exitCode = 1;
}
