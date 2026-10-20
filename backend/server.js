
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const schemeFinderRoutes = require("./routes/schemeFinder");
const workspaceRoutes = require("./routes/workspace");
const workspacesRouter = require("./routes/workspaces");
const recordsRouter = require("./routes/records");




const ReferenceData = require("./models/ReferenceData");
const TestRecord = require("./models/TestRecord");
const Scheme = require("./models/Scheme");
const StatePolicy = require("./models/StatePolicy");
const Incubator = require("./models/Incubator");
const StateIncentive = require("./models/StateIncentive");
const User = require("./models/User");
const SavedScheme = require("./models/SavedScheme");
const UserPreference = require("./models/UserPreference");


const app = express();
const PORT = process.env.PORT || 5000;

app.disable("x-powered-by");
app.use(express.json());


// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeRegex(value) {
  const text = String(value || "").trim();
  return text ? new RegExp(escapeRegex(text), "i") : null;
}

function pagination(query, defaultLimit = 12) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(query.limit, 10) || defaultLimit)
  );

  return { page, limit, skip: (page - 1) * limit };
}

function normalizeSchemeName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

async function getReferenceDataset(key) {
  const record = await ReferenceData.findOne({ key }).lean();
  return record ? record.data : null;
}

async function findMatchingSchemes(names = []) {
  const uniqueNames = [
    ...new Set(
      names.filter(
        (name) => typeof name === "string" && name.trim()
      )
    )
  ];

  if (!uniqueNames.length) return [];

  const allSchemes = await Scheme.find({}).lean();

  return uniqueNames.map((requestedName) => {
    const requested = normalizeSchemeName(requestedName);

    const scheme = allSchemes.find((item) => {
      const namesToCheck = [
        item.name,
        item.shortName,
        item.slug
      ].filter(Boolean);

      return namesToCheck.some(
        (name) => normalizeSchemeName(name) === requested
      );
    });

    return {
      requestedName,
      found: Boolean(scheme),
      scheme: scheme || null
    };
  });
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from backend/.env");
  }

  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue."
    });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login token."
    });
  }
}

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);


}





app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "StartupIQ API is running",
    endpoints: [
      "/api/health",
      "/api/schemes",
      "/api/states",
      "/api/state-incentives",
      "/api/incubators",
      "/api/finder/questions",
      "/api/lifecycle",
      "/api/needs"
    ]
  });
});


// --------------------------------------------------
// HOME AND HEALTH
// --------------------------------------------------

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to StartupIQ API"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "StartupIQ Unified API",
    port: PORT,
    message: "StartupIQ backend is healthy",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// --------------------------------------------------
// TEST RECORDS
// --------------------------------------------------

app.post(
  "/api/test-records",
  asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid title is required."
      });
    }

    const record = await TestRecord.create({
      title: title.trim(),
      description:
        typeof description === "string" ? description : ""
    });

    res.status(201).json({
      success: true,
      message: "Record saved successfully",
      data: record
    });
  })
);

app.get(
  "/api/test-records",
  asyncHandler(async (req, res) => {
    const data = await TestRecord.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, count: data.length, data });
  })
);

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

app.post(
  "/api/auth/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters."
      });
    }

    const existing = await User.findOne({ email });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12)
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token: createToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  })
);

app.post(
  "/api/auth/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive."
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      token: createToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  })
);

app.get(
  "/api/auth/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth.userId).select(
      "name email role isActive createdAt"
    );

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User account not found or inactive."
      });
    }

    res.json({ success: true, user });
  })
);

// --------------------------------------------------
// CENTRAL SCHEMES
// --------------------------------------------------

app.get(
  "/api/schemes",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query, 12);
    const filter = {};
    const search = makeRegex(req.query.search);

    if (search) {
      filter.$or = [
        { name: search },
        { slug: search },
        { shortName: search },
        { category: search },
        { ministry: search },
        { sectors: search },
        { stages: search },
        { stageFocus: search },
        { audience: search },
        { eligibility: search },
        { benefits: search },
        { objectives: search },
        { description: search },
        { supportTypes: search }
      ];
    }

    const sector = makeRegex(req.query.sector);
    if (sector) {
      filter.sectors = { $in: [sector] };
    }

    const stage = makeRegex(req.query.stage);
    if (stage) {
      filter.stages = { $in: [stage] };
    }

    const supportType = makeRegex(req.query.supportType);
    if (supportType) {
      filter.supportTypes = { $in: [supportType] };
    }

    const audience = makeRegex(req.query.audience);
    if (audience) {
      filter.audience = audience;
    }

    const [data, total] = await Promise.all([
      Scheme.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Scheme.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      count: data.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

// IMPORTANT: compare route must come before /:slug.
app.get(
  "/api/schemes/compare",
  asyncHandler(async (req, res) => {
    const slugs = [
      ...new Set(
        String(req.query.slugs || "")
          .split(",")
          .map((slug) => slug.trim())
          .filter(Boolean)
      )
    ];

    if (slugs.length < 2 || slugs.length > 3) {
      return res.status(400).json({
        success: false,
        message: "Provide between 2 and 3 scheme slugs."
      });
    }

    const schemes = await Scheme.find({
      slug: { $in: slugs }
    }).lean();

    const schemeMap = new Map(
      schemes.map((scheme) => [scheme.slug, scheme])
    );

    const missing = slugs.filter((slug) => !schemeMap.has(slug));

    if (missing.length) {
      return res.status(404).json({
        success: false,
        message: "One or more scheme slugs were not found.",
        missing
      });
    }

    res.json({
      success: true,
      count: slugs.length,
      data: slugs.map((slug) => schemeMap.get(slug))
    });
  })
);

app.get(
  "/api/schemes/:slug",
  asyncHandler(async (req, res) => {
    const scheme = await Scheme.findOne({
      slug: req.params.slug
    }).lean();

    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: "Scheme not found."
      });
    }

    res.json({ success: true, data: scheme });
  })
);

// --------------------------------------------------
// STATES AND UNION TERRITORIES
// --------------------------------------------------

app.get(
  "/api/states",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query, 20);
    const search = makeRegex(req.query.search);
    const filter = {};

    if (search) {
      filter.$or = [
        { state: search },
        { name: search },
        { title: search }
      ];
    }

    const [data, total] = await Promise.all([
      StatePolicy.find(filter)
        .sort({ state: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StatePolicy.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      count: data.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

app.get(
  "/api/states/:state",
  asyncHandler(async (req, res) => {
    const state = await StatePolicy.findOne({
      state: new RegExp(
        `^${escapeRegex(req.params.state)}$`,
        "i"
      )
    }).lean();

    if (!state) {
      return res.status(404).json({
        success: false,
        message: "State policy not found."
      });
    }

    res.json({ success: true, data: state });
  })
);

// --------------------------------------------------
// STATE INCENTIVES
// --------------------------------------------------

app.get(
  "/api/state-incentives/states",
  asyncHandler(async (req, res) => {
    const states = await StateIncentive.distinct("state");

    res.json({
      success: true,
      count: states.length,
      data: states.sort()
    });
  })
);

app.get(
  "/api/state-incentives",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query, 20);
    const filter = {};
    const search = makeRegex(req.query.search);

    const state = makeRegex(req.query.state);
    const type = makeRegex(req.query.type);
    const sector = makeRegex(req.query.sector);

    if (state) filter.state = state;
    if (type) filter.type = type;
    if (sector) filter.sectors = sector;

    if (search) {
      filter.$or = [
        { name: search },
        { state: search },
        { benefit: search },
        { description: search },
        { eligibility: search }
      ];
    }

    const [data, total] = await Promise.all([
      StateIncentive.find(filter)
        .sort({ state: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StateIncentive.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      count: data.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

app.get(
  "/api/state-incentives/:id",
  asyncHandler(async (req, res) => {
    const incentive = await StateIncentive.findOne({
      incentiveId: req.params.id
    }).lean();

    if (!incentive) {
      return res.status(404).json({
        success: false,
        message: "State incentive not found."
      });
    }

    res.json({ success: true, data: incentive });
  })
);

// --------------------------------------------------
// INCUBATORS
// --------------------------------------------------

app.get(
  "/api/incubators",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req.query, 12);
    const filter = {};
    const search = makeRegex(req.query.search);

    if (search) {
      filter.$or = [
        { name: search },
        { host: search },
        { city: search },
        { state: search },
        { sectors: search },
        { supportedBy: search },
        { type: search }
      ];
    }

    for (const field of ["state", "city", "type"]) {
      const value = makeRegex(req.query[field]);
      if (value) filter[field] = value;
    }

    const sector = makeRegex(req.query.sector);
    if (sector) filter.sectors = sector;

    const [data, total] = await Promise.all([
      Incubator.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Incubator.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      count: data.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

app.get(
  "/api/incubators/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid incubator ID."
      });
    }

    const incubator = await Incubator.findById(req.params.id).lean();

    if (!incubator) {
      return res.status(404).json({
        success: false,
        message: "Incubator not found."
      });
    }

    res.json({ success: true, data: incubator });
  })
);

// --------------------------------------------------
// QUICK SCHEME FINDER
// --------------------------------------------------

app.get(
  "/api/finder",
  asyncHandler(async (req, res) => {
    const filter = {};

    for (const field of ["sector", "stage", "supportType", "audience"]) {
      const value = makeRegex(req.query[field]);
      if (!value) continue;

      if (field === "sector") filter.sectors = { $in: [value] };
      if (field === "stage") filter.stages = { $in: [value] };
      if (field === "supportType") filter.supportTypes = { $in: [value] };
      if (field === "audience") filter.audience = value;
    }

    const data = await Scheme.find(filter)
      .sort({ name: 1 })
      .limit(50)
      .lean();

    res.json({ success: true, count: data.length, data });
  })
);

// --------------------------------------------------
// SHARED REFERENCE DATA
// --------------------------------------------------

const allowedReferenceKeys = [
  "decision-tree",
  "lifecycle",
  "needs-index",
  "psu",
  "states",
  "glossary",
  "about",
  "news",
  "india-map",
  "india-terrain",
  "aliases"
];

app.get(
  "/api/reference/:key",
  asyncHandler(async (req, res) => {
    const { key } = req.params;

    if (!allowedReferenceKeys.includes(key)) {
      return res.status(404).json({
        success: false,
        message: "Reference dataset not found."
      });
    }

    const data = await getReferenceDataset(key);

    if (data === null) {
      return res.status(404).json({
        success: false,
        message: "Dataset has not been imported yet."
      });
    }

    res.json({ success: true, key, data });
  })
);

// --------------------------------------------------
// FIVE-QUESTION SCHEME FINDER
// Uses the original decision-tree structure:
// questions[] -> branches[] -> schemes[]
// --------------------------------------------------

app.get(
  "/api/finder/questions",
  asyncHandler(async (req, res) => {
    const data = await getReferenceDataset("decision-tree");

    if (!data || !Array.isArray(data.questions)) {
      return res.status(404).json({
        success: false,
        message: "Decision tree data is missing."
      });
    }

    res.json({
      success: true,
      intro: data.intro,
      questions: data.questions
    });
  })
);

app.post(
  "/api/finder/results",
  asyncHandler(async (req, res) => {
    const { answers } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "answers must be an array."
      });
    }

    const tree = await getReferenceDataset("decision-tree");

    if (!tree || !Array.isArray(tree.questions)) {
      return res.status(404).json({
        success: false,
        message: "Decision tree data is missing."
      });
    }

    const selectedNames = [];
    const selectedBranches = [];
    const invalidAnswers = [];

    for (const answer of answers) {
      const question = tree.questions.find(
        (item) => String(item.id) === String(answer.questionId)
      );

      if (!question) {
        invalidAnswers.push(answer);
        continue;
      }

      const branch = (question.branches || []).find(
        (item) => item.label === answer.branchLabel
      );

      if (!branch) {
        invalidAnswers.push(answer);
        continue;
      }

      selectedBranches.push({
        questionId: question.id,
        question: question.question,
        label: branch.label,
        note: branch.note || ""
      });

      selectedNames.push(...(branch.schemes || []));
    }

    const matches = await findMatchingSchemes(selectedNames);
    const foundSchemes = [];
    const unmatchedSchemeNames = [];

    for (const item of matches) {
      if (item.found) {
        foundSchemes.push(item.scheme);
      } else {
        unmatchedSchemeNames.push(item.requestedName);
      }
    }

    const uniqueSchemes = [
      ...new Map(
        foundSchemes.map((scheme) => [
          scheme._id.toString(),
          scheme
        ])
      ).values()
    ];

    res.json({
      success: true,
      selectedBranches,
      invalidAnswers,
      count: uniqueSchemes.length,
      data: uniqueSchemes,
      unmatchedSchemeNames
    });
  })
);

// --------------------------------------------------
// LIFECYCLE MAP DATA
// --------------------------------------------------

app.get(
  "/api/lifecycle",
  asyncHandler(async (req, res) => {
    const data = await getReferenceDataset("lifecycle");

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Lifecycle data not found."
      });
    }

    const stages = data.stages || [];
    const requestedStage = req.query.stage;

    if (!requestedStage) {
      return res.json({
        success: true,
        intro: data.intro,
        count: stages.length,
        stages
      });
    }

    const stage = stages.find(
      (item) => item.id === requestedStage
    );

    if (!stage) {
      return res.status(404).json({
        success: false,
        message: "Invalid lifecycle stage."
      });
    }

    const names = [
      ...(stage.specific || []),
      ...(stage.relevant || [])
    ];

    const matches = await findMatchingSchemes(names);

    res.json({
      success: true,
      stage,
      schemes: {
        specific: matches.filter(
          (item) =>
            (stage.specific || []).includes(item.requestedName)
        ),
        relevant: matches.filter(
          (item) =>
            (stage.relevant || []).includes(item.requestedName)
        )
      }
    });
  })
);

// --------------------------------------------------
// WHAT DO YOU NEED?
// --------------------------------------------------

app.get(
  "/api/needs",
  asyncHandler(async (req, res) => {
    const data = await getReferenceDataset("needs-index");

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Needs data not found."
      });
    }

    const rows = data.rows || [];
    const requestedNeed = req.query.need;

    if (!requestedNeed) {
      return res.json({
        success: true,
        intro: data.intro,
        count: rows.length,
        rows
      });
    }

    const row = rows.find(
      (item) =>
        String(item.need || "").toLowerCase() ===
        String(requestedNeed).toLowerCase()
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Invalid support category."
      });
    }

    const names = [
      ...(row.startupSpecific || []),
      ...(row.startupRelevant || [])
    ];

    const matches = await findMatchingSchemes(names);

    res.json({
      success: true,
      need: row,
      schemes: {
        startupSpecific: matches.filter(
          (item) => (row.startupSpecific || []).includes(item.requestedName)
        ),
        startupRelevant: matches.filter(
          (item) => (row.startupRelevant || []).includes(item.requestedName)
        )
      }
    });
  })
);

// --------------------------------------------------
// GLOBAL SEARCH
// --------------------------------------------------

app.get(
  "/api/search",
  asyncHandler(async (req, res) => {
    const search = makeRegex(req.query.q || req.query.search);

    if (!search) {
      return res.status(400).json({
        success: false,
        message: "Provide a search query using q."
      });
    }

    const [schemes, states, incubators, incentives] = await Promise.all([
      Scheme.find({
        $or: [
          { name: search },
          { shortName: search },
          { slug: search },
          { description: search },
          { sectors: search }
        ]
      }).limit(10).lean(),

      StatePolicy.find({
        $or: [{ state: search }, { name: search }]
      }).limit(10).lean(),

      Incubator.find({
        $or: [
          { name: search },
          { city: search },
          { state: search },
          { host: search }
        ]
      }).limit(10).lean(),

      StateIncentive.find({
        $or: [
          { name: search },
          { state: search },
          { benefit: search }
        ]
      }).limit(10).lean()
    ]);

    res.json({
      success: true,
      data: { schemes, states, incubators, incentives }
    });
  })
);

// --------------------------------------------------
// USER SAVED SCHEMES
// Requires Authorization: Bearer <token>
// --------------------------------------------------

app.get(
  "/api/saved-schemes",
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await SavedScheme.find({
      user: req.auth.userId
    })
      .populate("scheme")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: data.length, data });
  })
);

app.post(
  "/api/saved-schemes",
  authenticate,
  asyncHandler(async (req, res) => {
    const slug = String(req.body.slug || "").trim();

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Scheme slug is required."
      });
    }

    const scheme = await Scheme.findOne({ slug });

    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: "Scheme not found."
      });
    }

    const data = await SavedScheme.findOneAndUpdate(
      { user: req.auth.userId, scheme: scheme._id },
      {
        $setOnInsert: {
          user: req.auth.userId,
          scheme: scheme._id
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, data });
  })
);

app.delete(
  "/api/saved-schemes/:schemeId",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.schemeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid scheme ID."
      });
    }

    const result = await SavedScheme.deleteOne({
      user: req.auth.userId,
      scheme: req.params.schemeId
    });

    res.json({
      success: true,
      deleted: result.deletedCount > 0
    });
  })
);

// --------------------------------------------------
// USER PREFERENCES
// --------------------------------------------------

app.get(
  "/api/preferences",
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await UserPreference.findOne({
      user: req.auth.userId
    }).lean();

    res.json({ success: true, data });
  })
);

app.put(
  "/api/preferences",
  authenticate,
  asyncHandler(async (req, res) => {
    const allowed = [
      "theme",
      "preferredLanguage",
      "preferredSectors",
      "preferredStages",
      "savedFilters"
    ];

    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[key] = req.body[key];
      }
    }

    if (
      update.theme &&
      !["light", "dark", "system"].includes(update.theme)
    ) {
      return res.status(400).json({
        success: false,
        message: "Theme must be light, dark, or system."
      });
    }

    const data = await UserPreference.findOneAndUpdate(
      { user: req.auth.userId },
      {
        $set: update,
        $setOnInsert: { user: req.auth.userId }
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data });
  })
);

// --------------------------------------------------
// ROUTE REGISTRATION
// --------------------------------------------------

// Main Dashboard APIs
app.use("/api/workspace", workspaceRoutes);
app.use("/api/finder", schemeFinderRoutes);

// Standalone Workspace APIs
app.use("/api/workspaces", workspacesRouter);
app.use("/api/workspaces/:workspaceId/records", recordsRouter);

// --------------------------------------------------
// SERVE FRONTENDS & STATIC ASSETS
// --------------------------------------------------
const rootDistPath = path.resolve(__dirname, "../dist");
const workspaceDistPath = path.resolve(
  __dirname,
  "../second/startupi-q-workspace/dist"
);

// 1. Static assets for workspace app under /workspace
app.use(
  "/workspace",
  express.static(workspaceDistPath, { index: false })
);

// 2. Static assets for main dashboard under /
app.use(express.static(rootDistPath, { index: false }));

// --------------------------------------------------
// SPA FALLBACK ROUTING
// --------------------------------------------------

// 3. Workspace SPA Fallback routing: /workspace and any nested routes
app.get(/^\/workspace(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(workspaceDistPath, "index.html"));
});

// 4. API 404 handler (runs for unhandled /api/* requests)
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// 5. Main Dashboard SPA Fallback routing (all other GET requests)
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(rootDistPath, "index.html"));
});

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed."
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this unique value already exists."
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError" ||
    error instanceof SyntaxError
  ) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  console.error("API error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// --------------------------------------------------
// CONNECT DATABASE AND START SERVER
// --------------------------------------------------

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from backend/.env");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  console.log("StartupIQ connected to MongoDB Atlas");

  app.listen(PORT, () => {
    console.log(`StartupIQ unified server running at http://localhost:${PORT}`);
    console.log(`  - Main Dashboard: http://localhost:${PORT}/`);
    console.log(`  - Workspace App:  http://localhost:${PORT}/workspace`);
    console.log(`  - Unified API:    http://localhost:${PORT}/api`);
  });
}

startServer().catch((error) => {
  console.error("StartupIQ startup failed:", error.message);
  process.exit(1);
});
