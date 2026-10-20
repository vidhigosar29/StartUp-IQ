const express = require("express");
const mongoose = require("mongoose");
const Workspace = require("../models/Workspace");
const BusinessRecord = require("../models/BusinessRecord");
const { businessTypes, cleanText } = require("../utils/workspaceValidation");

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const businessName = cleanText(req.body.businessName, 70);
    if (!businessName) {
      return res.status(400).json({ message: "Business name is required." });
    }
    if (!businessTypes.has(req.body.businessType)) {
      return res.status(400).json({ message: "Choose a valid business type." });
    }
    const workspace = await Workspace.create({
      businessName,
      businessType: req.body.businessType,
    });
    res.status(201).json({ workspace });
  } catch (e) {
    next(e);
  }
});

router.get("/:workspaceId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID." });
    }
    const workspace = await Workspace.findById(req.params.workspaceId).lean();
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found." });
    }
    res.json({ workspace });
  } catch (e) {
    next(e);
  }
});

router.patch("/:workspaceId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID." });
    }
    const updates = {};
    if (req.body.businessName !== undefined) {
      const name = cleanText(req.body.businessName, 70);
      if (!name) {
        return res.status(400).json({ message: "Business name cannot be empty." });
      }
      updates.businessName = name;
    }
    if (req.body.businessType !== undefined) {
      if (!businessTypes.has(req.body.businessType)) {
        return res.status(400).json({ message: "Choose a valid business type." });
      }
      updates.businessType = req.body.businessType;
    }
    const workspace = await Workspace.findByIdAndUpdate(
      req.params.workspaceId,
      updates,
      { new: true, runValidators: true }
    );
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found." });
    }
    res.json({ workspace });
  } catch (e) {
    next(e);
  }
});

router.delete("/:workspaceId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID." });
    }
    const workspace = await Workspace.findByIdAndDelete(req.params.workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found." });
    }
    await BusinessRecord.deleteMany({ workspaceId: workspace._id });
    res.json({ message: "Workspace and its records deleted." });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
