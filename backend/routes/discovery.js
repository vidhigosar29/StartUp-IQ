
const express = require("express");
const router = express.Router();
const Scheme = require("../models/Scheme");
const ReferenceData = require("../models/ReferenceData");

const normalize = (s = "") =>
  String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const ALIASES = {
  sisfsgrantpart: ["sisfs"],
  sisfsdebtpart: ["sisfs"],
  idexspark: ["idex"],
  idexprime: ["idex"],
  chiptostartupc2s: ["c2s", "chips to startup"],
  nqmstartupsupport: ["nqm"],
  sippip: ["sipp"],
  gemstartuprunway: ["gem startup runway"]
};

async function getData(key) {
  const doc = await ReferenceData.findOne({ key }).lean();
  return doc?.data || null;
}

async function resolveNames(names = []) {
  const schemes = await Scheme.find({}).lean();
  const found = [];
  const unmatched = [];

  for (const name of [...new Set(names.filter(Boolean))]) {
    const candidates = [name, ...(ALIASES[normalize(name)] || [])]
      .map(normalize);

    const match = schemes.find((s) =>
      [s.name, s.shortName, s.slug, ...(s.aliases || [])]
        .filter(Boolean)
        .map(normalize)
        .some((value) => candidates.includes(value))
    );

    if (match) {
      if (!found.some((s) => String(s._id) === String(match._id))) {
        found.push(match);
      }
    } else {
      unmatched.push(name);
    }
  }

  return { data: found, unmatchedSchemeNames: unmatched };
}

// Finder questions
router.get("/finder/questions", async (req, res) => {
  try {
    const data = await getData("decision-tree");
    if (!data?.questions) {
      return res.status(404).json({ success: false, message: "Decision tree missing" });
    }
    res.json({ success: true, intro: data.intro, questions: data.questions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Finder results: { "answers": [{ "questionId": 1, "branchLabel": "Yes" }] }
router.post("/finder/results", async (req, res) => {
  try {
    if (!Array.isArray(req.body.answers)) {
      return res.status(400).json({ success: false, message: "answers must be an array" });
    }

    const tree = await getData("decision-tree");
    if (!tree?.questions) {
      return res.status(404).json({ success: false, message: "Decision tree missing" });
    }

    const selectedBranches = [];
    const names = [];
    const invalidAnswers = [];

    for (const answer of req.body.answers) {
      const question = tree.questions.find(
        (q) => q.id === Number(answer.questionId)
      );
      const branch = question?.branches.find(
        (b) => b.label === answer.branchLabel
      );

      if (!branch) {
        invalidAnswers.push(answer);
        continue;
      }

      selectedBranches.push({
        questionId: question.id,
        question: question.question,
        label: branch.label,
        note: branch.note || ""
      });
      names.push(...(branch.schemes || []));
    }

    const result = await resolveNames(names);
    res.json({
      success: true,
      selectedBranches,
      invalidAnswers,
      count: result.data.length,
      data: result.data,
      unmatchedSchemeNames: result.unmatchedSchemeNames
    });
  } catch (e) {
    console.error("Finder results:", e);
    res.status(500).json({ success: false, message: "Finder failed" });
  }
});

// Lifecycle
router.get("/lifecycle", async (req, res) => {
  try {
    const data = await getData("lifecycle");
    if (!data?.stages) {
      return res.status(404).json({ success: false, message: "Lifecycle missing" });
    }

    if (!req.query.stage) {
      return res.json({
        success: true,
        intro: data.intro,
        count: data.stages.length,
        stages: data.stages
      });
    }

    const stage = data.stages.find((s) => s.id === req.query.stage);
    if (!stage) {
      return res.status(404).json({
        success: false,
        message: "Unknown lifecycle stage",
        validStages: data.stages.map((s) => s.id)
      });
    }

    const result = await resolveNames([
      ...(stage.specific || []),
      ...(stage.relevant || [])
    ]);

    res.json({
      success: true,
      stage,
      count: result.data.length,
      data: result.data,
      unmatchedSchemeNames: result.unmatchedSchemeNames
    });
  } catch (e) {
    console.error("Lifecycle:", e);
    res.status(500).json({ success: false, message: "Lifecycle request failed" });
  }
});

// Needs-based discovery
router.get("/needs", async (req, res) => {
  try {
    const data = await getData("needs-index");
    if (!data?.rows) {
      return res.status(404).json({ success: false, message: "Needs index missing" });
    }

    if (!req.query.need) {
      return res.json({
        success: true,
        intro: data.intro,
        count: data.rows.length,
        rows: data.rows
      });
    }

    const row = data.rows.find(
      (r) => normalize(r.need) === normalize(req.query.need)
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Unknown support category",
        validNeeds: data.rows.map((r) => r.need)
      });
    }

    const result = await resolveNames([
      ...(row.startupSpecific || []),
      ...(row.startupRelevant || [])
    ]);

    res.json({
      success: true,
      need: row,
      count: result.data.length,
      data: result.data,
      unmatchedSchemeNames: result.unmatchedSchemeNames
    });
  } catch (e) {
    console.error("Needs:", e);
    res.status(500).json({ success: false, message: "Needs request failed" });
  }
});

// Global scheme search
router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search needs at least 2 characters"
      });
    }

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");

    const data = await Scheme.find({
      $or: [
        { name: regex },
        { shortName: regex },
        { slug: regex },
        { category: regex },
        { ministry: regex },
        { sectors: regex },
        { stages: regex },
        { audience: regex },
        { supportTypes: regex },
        { eligibility: regex },
        { benefits: regex },
        { objectives: regex }
      ]
    }).sort({ name: 1 }).limit(50).lean();

    res.json({ success: true, query: q, count: data.length, data });
  } catch (e) {
    console.error("Search:", e);
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

module.exports = router;
