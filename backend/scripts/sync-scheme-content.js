
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");

const dataPath = path.join(__dirname, "..", "data", "schemes.json");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MongoDB URI is missing in backend/.env");
  }

  if (!fs.existsSync(dataPath)) {
    throw new Error(`Source file not found: ${dataPath}`);
  }

 const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const source = Array.isArray(parsed)
  ? parsed
  : Array.isArray(parsed.schemes)
    ? parsed.schemes
    : null;

if (!source) {
  throw new Error(
    "Could not find a schemes array in backend/data/schemes.json"
  );
}

  await mongoose.connect(uri);

  let updated = 0;
  let missing = 0;
  let skipped = 0;

  try {
    for (const item of source) {
      if (!item.slug) {
        skipped++;
        console.warn("Skipped a source record without slug");
        continue;
      }

      const content = {
        whatIsThis: item.whatIsThis ?? "",
        objectives: item.objectives ?? [],
        eligibility: item.eligibility ?? [],
        benefits: item.benefits ?? [],
        howToApply: item.howToApply ?? "",
        links: item.links ?? [],
        relatedSchemes: item.relatedSchemes ?? [],
        bestSuitedFor: item.bestSuitedFor ?? [],
        stages: item.stages ?? [],
        supportTypes: item.supportTypes ?? [],
        sectors: item.sectors ?? [],
        audience: item.audience ?? [],
        maxFunding: item.maxFunding ?? "",
        howMuch: item.howMuch ?? "",
        category: item.category ?? "",
        source: "startup-india-guide",
      };

      const result = await Scheme.updateOne(
        { slug: item.slug },
        { $set: { referenceContent: content } },
        { upsert: false }
      );

      if (result.matchedCount > 0) {
        updated++;
      } else {
        missing++;
        console.warn(`No MongoDB record matched slug: ${item.slug}`);
      }
    }

    console.log("\nScheme content sync complete.");
    console.log(`Source records: ${source.length}`);
    console.log(`Updated existing records: ${updated}`);
    console.log(`Missing database records: ${missing}`);
    console.log(`Skipped invalid source records: ${skipped}`);
    console.log("Existing top-level scheme fields were not replaced.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Scheme content sync failed:", error.message);
  process.exitCode = 1;
});
