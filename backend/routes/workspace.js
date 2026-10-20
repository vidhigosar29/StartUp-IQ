
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const WorkspaceRecord = require("../models/WorkspaceRecord");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const TYPES = [
  "product",
  "material",
  "sale",
  "expense",
  "customer",
  "experiment",
];

const num = (value) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

const text = (value) => String(value ?? "").trim();

function authenticateWorkspace(req, res, next) {
  try {
    const [scheme, token] = (
      req.headers.authorization || ""
    ).split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Please log in to access your workspace.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!mongoose.isValidObjectId(decoded.userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user session.",
      });
    }

    req.ownerId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please log in again.",
    });
  }
}

router.use(authenticateWorkspace);

function prepareRecord(type, body = {}) {
  const data = { ...body };
  let title = "";

  if (type === "product") {
    title = text(data.name);
    data.name = title;
    data.price = num(data.price);
    data.cost = num(data.cost);
    data.stock = Math.max(0, num(data.stock));
    data.lowStockAt = Math.max(0, num(data.lowStockAt ?? 5));
  }

  if (type === "material") {
    title = text(data.name);
    data.name = title;
    data.unit = text(data.unit || "units");
    data.quantity = Math.max(0, num(data.quantity));
    data.unitCost = Math.max(0, num(data.unitCost));
    data.lowStockAt = Math.max(0, num(data.lowStockAt ?? 5));
  }

  if (type === "sale") {
    data.customer = text(data.customer || "Walk-in customer");
    data.product = text(data.product);
    data.quantity = Math.max(1, num(data.quantity || 1));
    data.unitPrice = Math.max(0, num(data.unitPrice));
    data.total =
      data.total === "" || data.total == null
        ? data.quantity * data.unitPrice
        : Math.max(0, num(data.total));
    data.paymentStatus = [
      "Paid",
      "Due",
      "Partially paid",
    ].includes(data.paymentStatus)
      ? data.paymentStatus
      : "Paid";
    data.paymentMethod = text(data.paymentMethod || "UPI");
    data.date = text(data.date || new Date().toISOString().slice(0, 10));
    title = `${data.customer} - ${data.product || "Sale"}`;
  }

  if (type === "expense") {
    data.category = text(data.category || "Other");
    data.description = text(data.description);
    data.amount = Math.max(0, num(data.amount));
    data.date = text(data.date || new Date().toISOString().slice(0, 10));
    title = data.description;
  }

  if (type === "customer") {
    title = text(data.name);
    data.name = title;
    data.phone = text(data.phone);
    data.email = text(data.email);
    data.totalDue = Math.max(0, num(data.totalDue));
  }

  if (type === "experiment") {
    title = text(data.name);
    data.name = title;
    data.hypothesis = text(data.hypothesis);
    data.metric = text(data.metric || "Revenue");
    data.target = Math.max(0, num(data.target));
    data.status = text(data.status || "Planned");
    data.result = text(data.result);
  }

  if (!title) {
    throw new Error("Please provide a valid name or description.");
  }

  for (const value of Object.values(data)) {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || value < 0)
    ) {
      throw new Error("Amounts and quantities must be valid and non-negative.");
    }
  }

  return { title, data };
}

// GET workspace profile
router.get("/profile", async (req, res, next) => {
  try {
    const record = await WorkspaceRecord.findOne({
      owner: req.ownerId,
      type: "profile",
    }).lean();

    res.json({ success: true, data: record?.data || null });
  } catch (error) {
    next(error);
  }
});

// CREATE OR UPDATE workspace profile
router.put("/profile", async (req, res, next) => {
  try {
    const businessName = text(req.body.businessName);

    if (!businessName) {
      return res.status(400).json({
        success: false,
        message: "Business name is required.",
      });
    }

    const data = {
      businessName,
      businessType: text(req.body.businessType || "Startup founder"),
      businessStage: text(req.body.businessStage || "Just starting"),
      templateName: text(req.body.templateName || "Classic"),
      description: text(req.body.description),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(req.body.accentColor || "")
        ? req.body.accentColor
        : "#30483A",
    };

    const saved = await WorkspaceRecord.findOneAndUpdate(
      { owner: req.ownerId, type: "profile" },
      { $set: { title: businessName, data } },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: saved.data });
  } catch (error) {
    next(error);
  }
});

// READ records
router.get("/:type", async (req, res, next) => {
  try {
    const { type } = req.params;

    if (!TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record type.",
      });
    }

    const records = await WorkspaceRecord.find({
      owner: req.ownerId,
      type,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: records.length,
      data: records.map((record) => ({
        id: record._id,
        title: record.title,
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// CREATE record
router.post("/:type", async (req, res, next) => {
  try {
    const { type } = req.params;

    if (!TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record type.",
      });
    }

    const { title, data } = prepareRecord(type, req.body);

    const record = await WorkspaceRecord.create({
      owner: req.ownerId,
      type,
      title,
      data,
    });

    res.status(201).json({
      success: true,
      data: { id: record._id, title, ...data },
    });
  } catch (error) {
    if (error.message?.includes("required") ||
        error.message?.includes("valid")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

// UPDATE record
router.patch("/:type/:id", async (req, res, next) => {
  try {
    const { type, id } = req.params;

    if (!TYPES.includes(type) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record type or ID.",
      });
    }

    const { title, data } = prepareRecord(type, req.body);

    const record = await WorkspaceRecord.findOneAndUpdate(
      { _id: id, owner: req.ownerId, type },
      { $set: { title, data } },
      { new: true, runValidators: true }
    ).lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found.",
      });
    }

    res.json({
      success: true,
      data: { id: record._id, title, ...data },
    });
  } catch (error) {
    if (error.message?.includes("required") ||
        error.message?.includes("valid")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

// DELETE record
router.delete("/:type/:id", async (req, res, next) => {
  try {
    const { type, id } = req.params;

    if (!TYPES.includes(type) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid record type or ID.",
      });
    }

    const result = await WorkspaceRecord.deleteOne({
      _id: id,
      owner: req.ownerId,
      type,
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Record not found.",
      });
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    next(error);
  }
});

// IMPORT CSV — inserts new records; does not overwrite existing ones
router.post("/import/:type", upload.single("file"), async (req, res, next) => {
  try {
    const { type } = req.params;

    if (!TYPES.includes(type) || !req.file) {
      return res.status(400).json({
        success: false,
        message: "Select a supported record type and CSV file.",
      });
    }

    const rows = parse(req.file.buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    if (!rows.length || rows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "CSV must contain 1–1,000 data rows.",
      });
    }

    const documents = rows.map((row) => {
      const { title, data } = prepareRecord(type, row);
      return { owner: req.ownerId, type, title, data };
    });

    const inserted = await WorkspaceRecord.insertMany(documents);

    res.status(201).json({
      success: true,
      imported: inserted.length,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: `CSV import failed: ${error.message}`,
    });
  }
});

// DATA-DRIVEN INSIGHTS
router.get("/insights", async (req, res, next) => {
  try {
    const owner = req.ownerId;

    const [sales, expenses, products, materials] = await Promise.all([
      WorkspaceRecord.find({ owner, type: "sale" }).lean(),
      WorkspaceRecord.find({ owner, type: "expense" }).lean(),
      WorkspaceRecord.find({ owner, type: "product" }).lean(),
      WorkspaceRecord.find({ owner, type: "material" }).lean(),
    ]);

    const revenue = sales.reduce((sum, r) => sum + num(r.data.total), 0);
    const expenseTotal = expenses.reduce((sum, r) => sum + num(r.data.amount), 0);

    const cogs = sales.reduce((sum, sale) => {
      const product = products.find(
        (p) => p.data.name === sale.data.product
      );
      return sum + (product
        ? num(product.data.cost) * num(sale.data.quantity || 1)
        : 0);
    }, 0);

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenseTotal;
    const netMargin = revenue ? (netProfit / revenue) * 100 : 0;
    const averageOrderValue = sales.length ? revenue / sales.length : 0;

    const lowStockProducts = products.filter(
      (p) => num(p.data.stock) <= num(p.data.lowStockAt ?? 5)
    );

    const lowStockMaterials = materials.filter(
      (m) => num(m.data.quantity) <= num(m.data.lowStockAt ?? 5)
    );

    const byCategory = {};
    expenses.forEach((e) => {
      const category = e.data.category || "Other";
      byCategory[category] = (byCategory[category] || 0) + num(e.data.amount);
    });

    const insights = [];

    if (!sales.length) {
      insights.push({
        type: "tip",
        title: "Record your first sale",
        detail: "Revenue and profit insights will appear after sales are recorded.",
      });
    }

    if (revenue && netProfit < 0) {
      insights.push({
        type: "warning",
        title: "Recorded costs exceed revenue",
        detail: "Review product costs, operating expenses and pricing.",
      });
    } else if (revenue && netMargin < 10) {
      insights.push({
        type: "warning",
        title: "Profit margin is tight",
        detail: "Check packaging, shipping, marketing and other recurring costs.",
      });
    } else if (revenue && netMargin >= 25) {
      insights.push({
        type: "positive",
        title: "Healthy recorded margin",
        detail: `Your estimated net margin is ${netMargin.toFixed(1)}%. Track it over time.`,
      });
    }

    if (lowStockProducts.length) {
      insights.push({
        type: "warning",
        title: "Products need restocking",
        detail: `${lowStockProducts.length} product(s) are at or below the stock threshold.`,
      });
    }

    if (lowStockMaterials.length) {
      insights.push({
        type: "warning",
        title: "Materials are running low",
        detail: `${lowStockMaterials.length} material(s) need attention.`,
      });
    }

    const topExpense = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

    if (topExpense) {
      insights.push({
        type: "tip",
        title: "Largest expense category",
        detail: `${topExpense[0]} totals ₹${topExpense[1].toLocaleString("en-IN")}.`,
      });
    }

    res.json({
      success: true,
      data: {
        totals: {
          revenue,
          expenses: expenseTotal,
          cogs,
          grossProfit,
          netProfit,
          netMarginPercent: Number(netMargin.toFixed(2)),
          averageOrderValue: Number(averageOrderValue.toFixed(2)),
          salesCount: sales.length,
          lowStockProducts: lowStockProducts.length,
          lowStockMaterials: lowStockMaterials.length,
        },
        expensesByCategory: byCategory,
        insights,
        disclaimer: "Insights are based on saved records and are not financial or tax advice.",
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
