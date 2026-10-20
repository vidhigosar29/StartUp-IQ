const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    note: { type: String, default: "" },
    schemes: [
      {
        scheme: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Scheme",
          default: null,
        },
        name: { type: String, required: true },
        qual: { type: String, default: "" },
        slug: { type: String, default: null },
      },
    ],
    unresolved: { type: [String], default: [] },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, required: true },
    question: { type: String, required: true },
    order: { type: Number, required: true },
    branches: { type: [branchSchema], default: [] },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Question ||
  mongoose.model("Question", questionSchema);