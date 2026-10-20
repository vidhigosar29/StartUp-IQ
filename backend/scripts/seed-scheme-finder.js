
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
  override: false,
});

const Scheme = require("../models/Scheme");
const Question = require("../models/Questions");
const FinderMeta = require("../models/FinderMeta");

const dataDir = path.resolve(__dirname, "../data");

function readJson(file) {
  const fullPath = path.join(dataDir, file);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing original data file: ${fullPath}`);
  }

  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getSchemeList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.schemes)) return raw.schemes;

  throw new Error("Unexpected schemes.json format.");
}

function getAliasTarget(value) {
  if (typeof value === "string") return value;

  return value?.slug || value?.name || value?.shortName || "";
}

function buildLookup(schemes, aliases) {
  const lookup = new Map();

  function add(key, scheme) {
    if (key && !lookup.has(normalize(key))) {
      lookup.set(normalize(key), scheme);
    }
  }

  for (const scheme of schemes) {
    add(scheme.name, scheme);
    add(scheme.shortName, scheme);
    add(scheme.slug, scheme);
    add(`${scheme.name || ""} ${scheme.shortName || ""}`, scheme);
  }

  for (const [alias, target] of Object.entries(aliases || {})) {
    const targetName = getAliasTarget(target);

    const matched = schemes.find((scheme) =>
      [scheme.slug, scheme.name, scheme.shortName].some(
        (value) =>
          value && normalize(value) === normalize(targetName)
      )
    );

    if (matched) add(alias, matched);
  }

  return lookup;
}

function resolveSchemeName(rawEntry, lookup) {
  const isObject =
    rawEntry !== null &&
    typeof rawEntry === "object" &&
    !Array.isArray(rawEntry);

  const name = isObject
    ? (
        rawEntry.name ||
        rawEntry.shortName ||
        rawEntry.full ||
        rawEntry.slug ||
        ""
      )
    : rawEntry;

  if (typeof name !== "string" || !name.trim()) {
    throw new Error(
      `Invalid scheme entry: ${JSON.stringify(rawEntry)}`
    );
  }

  // First try the scheme name, short name or slug.
  let matched = lookup.get(normalize(name));

  // Also try the slug directly when the entry is an object.
  if (!matched && isObject && rawEntry.slug) {
    matched = lookup.get(normalize(rawEntry.slug));
  }

  // Support names such as "Scheme Name (special category)".
  let qual = isObject ? (rawEntry.qual || "") : "";

  if (!matched) {
    const qualified = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);

    if (qualified) {
      matched = lookup.get(normalize(qualified[1]));

      if (matched && !qual) {
        qual = qualified[2];
      }
    }
  }

  if (!matched) {
    throw new Error(
      `Cannot resolve "${name}". Check schemes.json and aliases.json.`
    );
  }

  return {
    scheme: matched,
    qual,
    details: isObject ? rawEntry : {},
  };
}

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI missing in backend/.env or root .env"
    );
  }

  const sourceSchemes = getSchemeList(readJson("schemes.json"));
  const tree = readJson("decision-tree.json");
  const aliases = readJson("aliases.json");

  if (!Array.isArray(tree.questions) || tree.questions.length !== 5) {
    throw new Error(
      "Expected the original five-question decision tree."
    );
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // Insert or update source schemes by slug.
    // Existing scheme records are not deleted.
    for (const source of sourceSchemes) {
      const slug =
        source.slug ||
        slugify(source.shortName || source.name);

      if (!source.name || !slug) {
        throw new Error(
          "A scheme is missing its name or slug."
        );
      }

      await Scheme.updateOne(
        { slug },
        { $set: { ...source, slug } },
        { upsert: true, runValidators: true }
      );
    }

    const dbSchemes = await Scheme.find({}).lean();
    const lookup = buildLookup(dbSchemes, aliases);

    const bySlug = new Map(
      dbSchemes.map((scheme) => [scheme.slug, scheme])
    );

    for (const question of tree.questions) {
      const branches = [];

      for (const branch of question.branches || []) {
        const resolvedSchemes = [];

        for (const entry of branch.schemes || []) {
          const resolved = resolveSchemeName(entry, lookup);

          const slug =
            resolved.scheme.slug ||
            slugify(
              resolved.scheme.shortName ||
              resolved.scheme.name
            );

          const dbScheme = bySlug.get(slug);

          if (!dbScheme) {
            throw new Error(
              `MongoDB scheme missing for "${resolved.scheme.name}".`
            );
          }

          const details = resolved.details || {};

          resolvedSchemes.push({
            scheme: dbScheme._id,
            name:
              typeof entry === "string"
                ? entry
                : (
                    details.name ||
                    details.shortName ||
                    details.full ||
                    dbScheme.name
                  ),
            qual: resolved.qual,
            slug: dbScheme.slug,
          });
        }

        branches.push({
          label: branch.label,
          note: branch.note || "",
          schemes: resolvedSchemes,
          unresolved: [],
        });
      }

      await Question.updateOne(
        { id: Number(question.id) },
        {
          $set: {
            id: Number(question.id),
            question: question.question,
            order: Number(question.id),
            branches,
          },
        },
        { upsert: true, runValidators: true }
      );
    }

    await FinderMeta.updateOne(
      { key: "tree" },
      {
        $set: {
          key: "tree",
          intro: tree.intro || "",
        },
      },
      { upsert: true }
    );

    console.log(
      `Scheme Finder seeded: ${sourceSchemes.length} schemes, ${tree.questions.length} questions.`
    );
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error) => {
  console.error("Scheme Finder seed failed:", error.message);
  process.exitCode = 1;
});
