const mongoose = require("mongoose");

const finderMetaSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    intro: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.FinderMeta ||
  mongoose.model("FinderMeta", finderMetaSchema);