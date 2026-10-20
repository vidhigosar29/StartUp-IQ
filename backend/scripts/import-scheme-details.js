
const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");

const htmlDirectory = path.resolve(
  __dirname,
  "../../reference-docs/docs/docs/schemes"
);

const jsonPath = path.resolve(
  __dirname,
  "../data/schemes.json"
);

const APPLY = process.argv.includes("--apply");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getSchemes(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.schemes)) return data.schemes;
  if (Array.isArray(data.data)) return data.data;

  throw new Error("Could not find the schemes array in schemes.json");
}

function decodeEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getMeta(html, key, attribute = "name") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const tags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const attrMatch = tag.match(
      new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, "i")
    );

    if (!attrMatch || attrMatch[1] !== key) continue;

    const contentMatch = tag.match(
      /\bcontent\s*=\s*(["'])(.*?)\1/i
    );

    if (contentMatch) {
      return decodeEntities(contentMatch[2].trim());
    }
  }

  return "";
}

function extractStructuredData(html) {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      const service = entries.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry.name || entry.description || entry.provider)
      );

      if (service) return service;
    } catch {
      // Try another structured-data block if present.
    }
  }

  return null;
}

async function main() {
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    throw new Error(
      "MongoDB connection variable missing in backend/.env. " +
      "Check the variable name used by your existing backend."
    );
  }

  if (!fs.existsSync(htmlDirectory)) {
    throw new Error(`HTML folder not found: ${htmlDirectory}`);
  }

  const schemes = getSchemes(readJson(jsonPath));
  const files = fs
    .readdirSync(htmlDirectory)
    .filter((file) => file.toLowerCase().endsWith(".html"));

  const schemesBySlug = new Map(
    schemes.map((scheme) => [
      String(scheme.slug).toLowerCase(),
      scheme,
    ])
  );

  const records = [];

  for (const file of files) {
    const slug = path.basename(file, ".html").toLowerCase();
    const existing = schemesBySlug.get(slug);

    if (!existing) {
      console.warn(`Skipping unmatched HTML file: ${file}`);
      continue;
    }

    const html = fs.readFileSync(
      path.join(htmlDirectory, file),
      "utf8"
    );

    const structured = extractStructuredData(html);

    if (!structured) {
      console.warn(`Skipping file without structured data: ${file}`);
      continue;
    }

    const provider =
      typeof structured.provider === "object"
        ? structured.provider?.name || ""
        : structured.provider || "";

    records.push({
      slug,
      referenceDetails: {
        source: "startup-india-guide",
        sourceFile: file,
        pageTitle: getMeta(html, "og:title", "property"),
        metaDescription: getMeta(html, "description"),
        fullName: structured.name || "",
        alternateName: structured.alternateName || "",
        description: structured.description || "",
        provider,
        officialUrl: structured.url || "",
        importedAt: new Date().toISOString(),
      },
    });
  }

  console.log(`HTML files: ${files.length}`);
  console.log(`Matched records prepared: ${records.length}`);
  console.log(`Mode: ${APPLY ? "APPLY TO DATABASE" : "DRY RUN"}`);

  if (!APPLY) {
    console.log(
      "No database changes made. Run with --apply to save these details."
    );
    return;
  }

  await mongoose.connect(
    process.env.MONGODB_URI || process.env.MONGO_URI
  );

  let updated = 0;
  let missing = 0;

  try {
    for (const record of records) {
      // Update only existing records. Never create duplicates here.
      const result = await Scheme.updateOne(
        { slug: record.slug },
        { $set: { referenceDetails: record.referenceDetails } },
        { upsert: false }
      );

      if (result.matchedCount > 0) {
        updated++;
      } else {
        missing++;
        console.warn(
          `No MongoDB record found for slug: ${record.slug}`
        );
      }
    }

    console.log("\nImport completed.");
    console.log(`Existing records updated: ${updated}`);
    console.log(`Missing MongoDB records: ${missing}`);
    console.log("Existing scheme fields were not intentionally replaced.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Import failed:", error.message);
  process.exitCode = 1;
});
