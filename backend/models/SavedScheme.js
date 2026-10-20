
const mongoose = require("mongoose");

const savedSchemeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    scheme: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scheme",
      required: true
    },
    notes: {
      type: String,
      default: "",
      maxlength: 1000
    }
  },
  { timestamps: true }
);

savedSchemeSchema.index(
  { user: 1, scheme: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.SavedScheme ||
  mongoose.model("SavedScheme", savedSchemeSchema);
