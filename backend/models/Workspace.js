const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 70 },
    businessType: {
      type: String,
      required: true,
      enum: [
        "home-bakery",
        "jewellery",
        "nail-artist",
        "tailoring",
        "boutique",
        "beauty",
        "crafts",
        "other",
      ],
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);
