const Question = require("../models/Questions");
const FinderMeta = require("../models/FinderMeta");

exports.getTree = async (req, res, next) => {
  try {
    const [questions, meta] = await Promise.all([
      Question.find()
        .sort({ order: 1 })
        .populate("branches.schemes.scheme")
        .lean(),

      FinderMeta.findOne({ key: "tree" }).lean(),
    ]);

    if (!questions.length) {
      return res.status(404).json({
        success: false,
        message:
          "Questions are missing. Import the original decision tree into MongoDB.",
      });
    }

    const result = questions.map((question) => ({
      id: question.id,
      question: question.question,

      branches: question.branches.map((branch) => ({
        label: branch.label,
        note: branch.note || "",

        schemes: branch.schemes.map((item) => {
          const scheme = item.scheme;

          return {
            name: item.name,
            qual: item.qual || "",
            slug: scheme?.slug || item.slug || null,
            category: scheme?.category || "",
            full: scheme?.name || item.name,
            tagline: scheme?.tagline || "",
          };
        }),

        unresolved: branch.unresolved || [],
      })),
    }));

    res.json({
      success: true,
      intro: meta?.intro || "",
      questions: result,
    });
  } catch (error) {
    next(error);
  }
};