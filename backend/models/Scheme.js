
const mongoose = require("mongoose");

const schemeSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports =
  mongoose.models.Scheme ||
  mongoose.model("Scheme", schemeSchema);
