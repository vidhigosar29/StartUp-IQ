
const mongoose = require("mongoose");

const referenceDataSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports =
  mongoose.models.ReferenceData ||
  mongoose.model("ReferenceData", referenceDataSchema);
