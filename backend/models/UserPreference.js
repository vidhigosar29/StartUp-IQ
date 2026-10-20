
const mongoose = require("mongoose");

const userPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "light"
    },
    preferredLanguage: {
      type: String,
      default: "en"
    },
    preferredSectors: {
      type: [String],
      default: []
    },
    preferredStages: {
      type: [String],
      default: []
    },
    savedFilters: {
      type: [
        {
          name: { type: String, trim: true },
          filters: { type: mongoose.Schema.Types.Mixed, default: {} }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.UserPreference ||
  mongoose.model("UserPreference", userPreferenceSchema);
