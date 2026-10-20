import { useCallback, useEffect, useMemo, useState } from "react";
import SchemeFinder from "./components/SchemeFinder";
import NeedsIndex from "./components/NeedsIndex";
import {
  getSchemes,
  getScheme,
  getStates,
  getIncubators,
} from "./services/api";
import "./App.css";
import AuthPage from "./components/AuthPage";
import { WORKSPACE_URL } from "./config/workspace";
import BusinessWorkspace from "./components/BusinessWorkspace";



const normaliseList = (response, keys = []) => {
  const data = response?.data;

  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(data?.data?.[key])) return data.data[key];
  }

  if (Array.isArray(data?.data)) return data.data;

  return [];
};

const read = (item, ...keys) => {
  for (const key of keys) {
    const value = item?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
};

const getSlug = (item) =>
  read(item, "slug", "_id", "id", "schemeId");

const getName = (item) =>
  read(item, "name", "title", "schemeName", "shortName") ||
  "Untitled scheme";

const getDescription = (item) =>
  read(
    item,
    "shortDescription",
    "description",
    "summary",
    "objective"
  ) ||
  "Open this scheme to explore its available information and official resources.";

const getCategories = (item, keys) => {
  const value = read(item, ...keys);

  if (Array.isArray(value)) return value.join(", ");

  if (typeof value === "object" && value !== null) {
    return Object.values(value).join(", ");
  }

  return String(value || "");
};

const getErrorMessage = (error) =>
  error?.response?.data?.message ||
  error?.message ||
  "Something went wrong. Please try again.";

const supportKeys = [
  "supportType",
  "supportTypes",
  "support",
  "category",
];

const stageKeys = [
  "stage",
  "stages",
  "startupStage",
  "startupStages",
];

const sectorKeys = [
  "sector",
  "sectors",
  "industries",
];

export default function App() {
  const [page, setPage] = useState("overview");
  const [showBusinessWorkspace, setShowBusinessWorkspace] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [states, setStates] = useState([]);
  const [incubators, setIncubators] = useState([]);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceChecking, setWorkspaceChecking] = useState(false);

  const handleOpenWorkspace = async () => {
    setWorkspaceNotice("");
    setWorkspaceChecking(true);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      await fetch(WORKSPACE_URL, { mode: "no-cors", signal: controller.signal });
      clearTimeout(timer);
      window.location.href = WORKSPACE_URL;
    } catch {
      setWorkspaceChecking(false);
      setWorkspaceNotice(
        `StartupIQ Workspace at ${WORKSPACE_URL} is currently unreachable. Make sure both frontends are running by executing "npm run dev:all" from the project root.`
      );
    }
  };

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  const [query, setQuery] = useState("");
  const [supportFilter, setSupportFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [view, setView] = useState("cards");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [compareList, setCompareList] = useState([]);

  const clearFilters = () => {
    setQuery("");
    setSupportFilter("");
    setStageFilter("");
    setSectorFilter("");
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

  


 
    const [
      schemeResponse,
      stateResponse,
      incubatorResponse,
    ] = await Promise.allSettled([
      getSchemes({ limit: 200 }),
      getStates(),
      getIncubators({ limit: 300 }),
    ]);

    if (schemeResponse.status === "fulfilled") {
      setSchemes(
        normaliseList(schemeResponse.value, [
          "schemes",
          "results",
          "items",
        ])
      );
    } else {
      setSchemes([]);
      setError(getErrorMessage(schemeResponse.reason));
    }

    if (stateResponse.status === "fulfilled") {
      setStates(
        normaliseList(stateResponse.value, [
          "states",
          "results",
          "items",
        ])
      );
    }

    if (incubatorResponse.status === "fulfilled") {
      setIncubators(
        normaliseList(incubatorResponse.value, [
          "incubators",
          "results",
          "items",
        ])
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);


 const [showAuth, setShowAuth] = useState(
  !localStorage.getItem("startupiq_token")
);


  const supportOptions = useMemo(
    () =>
      [
        ...new Set(
          schemes
            .map((item) => getCategories(item, supportKeys))
            .filter(Boolean)
        ),
      ].sort(),
    [schemes]
  );

  const stageOptions = useMemo(
    () =>
      [
        ...new Set(
          schemes
            .map((item) => getCategories(item, stageKeys))
            .filter(Boolean)
        ),
      ].sort(),
    [schemes]
  );

  const sectorOptions = useMemo(
    () =>
      [
        ...new Set(
          schemes
            .map((item) => getCategories(item, sectorKeys))
            .flatMap((value) =>
              value.split(",").map((part) => part.trim())
            )
            .filter(Boolean)
        ),
      ].sort(),
    [schemes]
  );

  const filteredSchemes = useMemo(() => {
    const search = query.trim().toLowerCase();

    return schemes.filter((item) => {
      const support = getCategories(item, supportKeys);
      const stage = getCategories(item, stageKeys);
      const sector = getCategories(item, sectorKeys);

      const searchable = [
        getName(item),
        getDescription(item),
        getSlug(item),
        support,
        stage,
        sector,
        getCategories(item, [
          "audience",
          "targetAudience",
          "beneficiaries",
        ]),
        getCategories(item, [
          "eligibility",
          "eligibilityCriteria",
          "whoCanApply",
        ]),
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!search || searchable.includes(search)) &&
        (!supportFilter || support === supportFilter) &&
        (!stageFilter || stage === stageFilter) &&
        (
          !sectorFilter ||
          sector
            .split(",")
            .map((part) => part.trim())
            .includes(sectorFilter)
        )
      );
    });
  }, [
    schemes,
    query,
    supportFilter,
    stageFilter,
    sectorFilter,
  ]);

  const navigate = (nextPage) => {
    const validPages = [
      "overview",
      "finder",
      "needs",
      "lifecycle",
      "schemes",
      "compare",
      "states",
      "state-schemes",
      "state-portals",
      "incubators",
      "psu",
      "detail",
    ];

    setPage(
      validPages.includes(nextPage) ? nextPage : "overview"
    );

    setMobileMenu(false);

    if (nextPage !== "detail") {
      setSelectedScheme(null);
    }
  };

  const openScheme = async (item) => {
    setSelectedScheme(item);
    setDetailError("");
    setDetailLoading(true);
    setPage("detail");



    const slug = getSlug(item);

    if (!slug) {
      setDetailLoading(false);
      return;
    }

    try {
      const response = await getScheme(slug);
      const data = response?.data;

      const detail =
        data?.scheme ||
        data?.data?.scheme ||
        data?.data ||
        data;

      if (
        detail &&
        typeof detail === "object" &&
        !Array.isArray(detail)
      ) {
        setSelectedScheme((previous) => ({
          ...previous,
          ...detail,
        }));
      }
    } catch (err) {
      setDetailError(getErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleCompare = (item) => {
    const slug = getSlug(item);

    if (!slug) return;

    setCompareList((current) => {
      if (current.some((x) => getSlug(x) === slug)) {
        return current.filter((x) => getSlug(x) !== slug);
      }

      if (current.length >= 3) {
        window.alert(
          "You can compare a maximum of 3 schemes."
        );
        return current;
      }

      return [...current, item];
    });
  };


  if (showBusinessWorkspace) {
  return (
    <BusinessWorkspace
      onBack={() => setShowBusinessWorkspace(false)}
    />
  );
}

  const navigationGroups = [
    {
      title: "GET ORIENTED",
      items: [
        { id: "overview", label: "Overview", icon: "⚐" },
        { id: "finder", label: "Scheme Finder", icon: "⊙" },
        { id: "lifecycle", label: "Lifecycle Map", icon: "♧" },
        { id: "needs", label: "What do you need?", icon: "◎" },
      ],
    },
    {
      title: "BROWSE",
      items: [
        { id: "schemes", label: "All schemes", icon: "⊞" },
        { id: "compare", label: "Compare schemes", icon: "⚖" },
      ],
    },
    {
      title: "BEYOND CENTRAL SCHEMES",
      items: [
        {
          id: "state-schemes",
          label: "State & UT schemes",
          icon: "▱",
        },
        {
          id: "incubators",
          label: "Incubators directory",
          icon: "♧",
        },
        {
          id: "psu",
          label: "PSU & regulator programs",
          icon: "▦",
        },
        {
          id: "state-portals",
          label: "State portals",
          icon: "◫",
        },
      ],
    },
  ];


  

  const pageTitles = {
    overview: [
      "Good things start here.",
      "Your guide to India's startup support ecosystem.",
    ],
    schemes: [
      "Central schemes",
      "Explore support programmes for your startup.",
    ],
    finder: [
      "Find your support",
      "Start with what your business needs.",
    ],
    needs: [
      "What do you need?",
      "Explore startup support by the problem you want to solve.",
    ],
    lifecycle: [
      "Lifecycle map",
      "Explore support across your startup journey.",
    ],
    compare: [
      "Compare schemes",
      "Evaluate up to three programmes side by side.",
    ],
    states: [
      "State & UT support",
      "Explore startup policies and regional incentives.",
    ],
    "state-schemes": [
      "State & UT schemes",
      "Browse available state and regional records.",
    ],
    "state-portals": [
      "State startup portals",
      "Find official portals in the available state records.",
    ],
    psu: [
      "PSU & regulator programmes",
      "Browse available programmes and scheme records.",
    ],
    incubators: [
      "Incubator directory",
      "Discover organisations that help startups grow.",
    ],
    detail: [
      getName(selectedScheme || {}),
      "Scheme information and available resources.",
    ],
  };

  const currentTitle =
    pageTitles[page] || pageTitles.overview;

  if (showAuth) {
    return <AuthPage onLogin={() => setShowAuth(false)} />;
  }

  if (showBusinessWorkspace) {
    return (
      <BusinessWorkspace
        onBack={() => setShowBusinessWorkspace(false)}
      />
    );
  }



    
  const goToSearch = (term) => {
    clearFilters();
    setQuery(term);
    navigate("schemes");
  };

  

  return (
    <div className="siq-app">
      <aside
        className={`siq-sidebar ${
          mobileMenu ? "siq-sidebar-open" : ""
        }`}
      >
        <button
          className="siq-brand"
          onClick={() => navigate("overview")}
          aria-label="Go to StartupIQ overview"
        >
          <span className="siq-brand-mark">S.</span>
          <span className="siq-brand-copy">
            <strong>StartupIQ</strong>
            <small>INDIA STARTUP GUIDE</small>
          </span>
        </button>

        <nav className="siq-nav" aria-label="Main navigation">
          {navigationGroups.map((group) => (
            <div className="siq-nav-group" key={group.title}>
              <div className="siq-side-label">{group.title}</div>

              <div className="siq-nav">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`siq-nav-item ${
                      page === item.id ||
                      (
                        page === "detail" &&
                        item.id === "schemes"
                      )
                        ? "active"
                        : ""
                    }`}
                    onClick={() => navigate(item.id)}
                  >
                    <span className="siq-nav-icon">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="siq-sidebar-bottom">
          <div className="siq-help-card">
            <strong>Need a starting point?</strong>
            <p>
              Answer a few questions to explore support.
            </p>
            <button onClick={() => navigate("finder")}>
              Open Scheme Finder ↗
            </button>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <button
          className="siq-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="siq-main">
        <header className="siq-topbar">
          <button
            className="siq-menu-toggle"
            onClick={() =>
              setMobileMenu((value) => !value)
            }
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="siq-breadcrumb">
            <span>StartupIQ</span>
            <span>/</span>
            <strong>{currentTitle[0]}</strong>
          </div>

          <div className="siq-topbar-right">
            <span className="siq-live-label">
              <span className="siq-status-dot" />
              LIVE DIRECTORY
            </span>

            <button
              className="siq-refresh-button"
              onClick={loadDashboardData}
              disabled={loading}
              title="Refresh data"
            >
              ↻ <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="siq-content">
          <section className="siq-page-heading">
            <div>
              <div className="siq-eyebrow">
                YOUR STARTUP JOURNEY, SIMPLIFIED
              </div>
              <h1>{currentTitle[0]}</h1>
              <p>{currentTitle[1]}</p>
            </div>

            <div className="overview-actions">
  {/* Keep your existing Find my support button here */}

  
</div>


            <button
              type="button"
              className="setup-space-entry"
              disabled={workspaceChecking}
              onClick={handleOpenWorkspace}
            >
              <span>{workspaceChecking ? "⏳" : "↗"}</span>
              <strong>
                {workspaceChecking ? "Opening Workspace…" : "Set Up My Space"}
              </strong>
              <small>Custom workspace for your startup or business</small>
            </button>

            <button
              className="siq-primary-button"
              onClick={() => navigate("finder")}
            >
              Find my support <span>↗</span>
            </button>
          </section>

          {workspaceNotice && (
            <div className="siq-alert" role="alert">
              <span><strong>Workspace Unavailable:</strong> {workspaceNotice}</span>
              <div className="siq-alert-actions">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = WORKSPACE_URL;
                  }}
                >
                  Open Anyway ↗
                </button>
                <button
                  type="button"
                  onClick={handleOpenWorkspace}
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceNotice("")}
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="siq-alert" role="alert">
              <strong>Could not load schemes.</strong> {error}
              <button onClick={loadDashboardData}>
                Try again
              </button>
            </div>
          )}

          {page === "overview" && (
            <>
              <section className="siq-original-hero">
                <div className="siq-original-hero-copy">
                  <div className="siq-original-kicker">
                    🇮🇳 Government of India · Startup Support Guide
                  </div>

                  <h2>
                    Every central government scheme for your
                    startup, in one place.
                  </h2>

                  <p>
                    Explore government support programmes for
                    startups — grants, equity, loans, incubation
                    and market access — organised to help you
                    discover relevant opportunities.
                  </p>

                  <div className="siq-original-hero-actions">
                    <button
                      className="siq-primary-button"
                      onClick={() => navigate("finder")}
                    >
                      Find my support <span>↗</span>
                    </button>

                    <button
                      className="siq-secondary-button"
                      onClick={() => {
                        clearFilters();
                        navigate("schemes");
                      }}
                    >
                      Explore all schemes →
                    </button>
                  </div>
                </div>

                <div
                  className="siq-original-hero-art"
                  aria-hidden="true"
                >
                  <div className="siq-original-orbit siq-original-orbit-one" />
                  <div className="siq-original-orbit siq-original-orbit-two" />
                  <div className="siq-original-sun" />

                  <div className="siq-original-art-card">
                    <span>YOUR STARTUP JOURNEY</span>
                    <strong>Ideas into impact.</strong>
                    <span className="siq-original-art-arrow">
                      ↗
                    </span>
                  </div>

                  <span className="siq-original-spark">✳</span>
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-stat-grid">
                  <article className="siq-original-stat-card">
                    <span>CENTRAL SCHEMES</span>
                    <strong>
                      {loading ? "—" : schemes.length}
                    </strong>
                    <small>Programmes in the directory</small>
                  </article>

                  <article className="siq-original-stat-card">
                    <span>STATES &amp; UTs</span>
                    <strong>
                      {loading ? "—" : states.length}
                    </strong>
                    <small>Regional records available</small>
                  </article>

                  <article className="siq-original-stat-card">
                    <span>INCUBATORS</span>
                    <strong>
                      {loading ? "—" : incubators.length}
                    </strong>
                    <small>Organisations listed</small>
                  </article>
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">YOUR NEXT STEP</span>
                    <h2>Start here</h2>
                    <p>
                      Choose the starting point that best matches
                      your needs.
                    </p>
                  </div>
                </div>

                <div className="siq-original-start-grid">
                  {[
                    {
                      icon: "⌕",
                      number: "01 / DISCOVER",
                      title: "Scheme Finder",
                      description:
                        "Answer guided questions to discover relevant support.",
                      label: "Find my schemes ↗",
                      action: () => navigate("finder"),
                    },
                    {
                      icon: "◇",
                      number: "02 / IDENTIFY",
                      title: "What do you need?",
                      description:
                        "Explore funding, credit, incubation and market access.",
                      label: "Explore support ↗",
                      action: () => navigate("needs"),
                    },
                    {
                      icon: "⌁",
                      number: "03 / PLAN",
                      title: "Lifecycle Map",
                      description:
                        "Find programmes for ideation, prototypes and growth.",
                      label: "Explore stages ↗",
                      action: () => navigate("lifecycle"),
                    },
                    {
                      icon: "⇄",
                      number: "04 / EVALUATE",
                      title: "Compare schemes",
                      description:
                        "Compare up to three programmes side by side.",
                      label: "Compare options ↗",
                      action: () => navigate("compare"),
                    },
                  ].map((item) => (
                    <button
                      className="siq-original-start-card"
                      key={item.title}
                      onClick={item.action}
                    >
                      <span className="siq-original-card-icon">
                        {item.icon}
                      </span>
                      <span className="siq-original-card-label">
                        {item.number}
                      </span>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                      <span className="siq-original-card-link">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">
                      FIND THE RIGHT KIND OF HELP
                    </span>
                    <h2>Browse by type of support</h2>
                    <p>
                      Explore programmes according to the support
                      they provide.
                    </p>
                  </div>

                  <button
                    className="siq-text-button"
                    onClick={() => {
                      clearFilters();
                      navigate("schemes");
                    }}
                  >
                    All schemes →
                  </button>
                </div>

                <div className="siq-original-category-grid">
                  {[
                    {
                      icon: "₹",
                      name: "Grant",
                      desc: "Non-dilutive financial support",
                      term: "grant",
                    },
                    {
                      icon: "↗",
                      name: "Equity",
                      desc: "Investment and venture funding",
                      term: "equity",
                    },
                    {
                      icon: "▤",
                      name: "Loan / Credit",
                      desc: "Loans and credit guarantees",
                      term: "credit",
                    },
                    {
                      icon: "⌂",
                      name: "Incubation",
                      desc: "Mentorship and startup support",
                      term: "incubat",
                    },
                    {
                      icon: "◎",
                      name: "Market Access",
                      desc: "Customers, procurement and IP",
                      term: "market",
                    },
                    {
                      icon: "✳",
                      name: "Mixed",
                      desc: "Multiple forms of assistance",
                      term: "mixed",
                    },
                  ].map((item) => (
                    <button
                      className="siq-original-category-card"
                      key={item.name}
                      onClick={() => goToSearch(item.term)}
                    >
                      <span className="siq-original-card-icon">
                        {item.icon}
                      </span>
                      <strong>{item.name}</strong>
                      <p>{item.desc}</p>
                      <span className="siq-original-card-link">
                        Explore →
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">FROM IDEA TO SCALE</span>
                    <h2>Browse by lifecycle stage</h2>
                    <p>
                      Find support aligned with your startup's
                      current stage.
                    </p>
                  </div>

                  <button
                    className="siq-text-button"
                    onClick={() => navigate("lifecycle")}
                  >
                    Full map →
                  </button>
                </div>

                <div className="siq-original-stage-grid">
                  {[
                    {
                      code: "I",
                      name: "Ideation",
                      desc: "Validate your idea and explore early support.",
                      term: "ideation",
                    },
                    {
                      code: "P",
                      name: "Prototype / PoC",
                      desc: "Build and test a proof of concept.",
                      term: "prototype",
                    },
                    {
                      code: "S",
                      name: "Seed / Early-Stage",
                      desc: "Develop your product and begin operations.",
                      term: "seed",
                    },
                    {
                      code: "G",
                      name: "Growth / Scaling",
                      desc: "Expand operations and reach new markets.",
                      term: "growth",
                    },
                    {
                      code: "M",
                      name: "Market Access & IP",
                      desc: "Protect innovation and access markets.",
                      term: "market access",
                    },
                  ].map((item) => (
                    <button
                      className="siq-original-stage-card"
                      key={item.code}
                      onClick={() => goToSearch(item.term)}
                    >
                      <span className="siq-original-stage-code">
                        {item.code}
                      </span>
                      <strong>{item.name}</strong>
                      <p>{item.desc}</p>
                      <span className="siq-original-card-link">
                        Explore schemes →
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">
                      INDUSTRY-SPECIFIC SUPPORT
                    </span>
                    <h2>Browse by sector</h2>
                    <p>
                      Explore support programmes for different
                      innovation sectors.
                    </p>
                  </div>
                </div>

                <div className="siq-original-sector-grid">
                  {[
                    ["✈", "Defence & Aerospace", "defence"],
                    ["🚀", "Space", "space"],
                    ["⚕", "Biotechnology", "biotechnology"],
                    ["🌱", "Agriculture & Food", "agriculture"],
                    ["◈", "Semiconductors", "semiconductor"],
                    ["⚛", "Quantum Technology", "quantum"],
                    ["⌘", "Deep Tech", "deep tech"],
                    ["▦", "Digital Technology", "digital technology"],
                  ].map(([icon, sector, term]) => (
                    <button
                      className="siq-original-sector-card"
                      key={sector}
                      onClick={() => goToSearch(term)}
                    >
                      <span>{icon}</span>
                      <strong>{sector}</strong>
                      <span className="siq-original-sector-arrow">
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">
                      POPULAR PROGRAMMES
                    </span>
                    <h2>Flagship starting points</h2>
                    <p>
                      Quick access to well-known startup support
                      programmes present in your directory.
                    </p>
                  </div>

                  <button
                    className="siq-text-button"
                    onClick={() => {
                      clearFilters();
                      navigate("schemes");
                    }}
                  >
                    See all →
                  </button>
                </div>

                {(() => {
                  const names = [
                    "Startup India Seed Fund Scheme",
                    "Fund of Funds for Startups",
                    "Credit Guarantee Scheme for Startups",
                    "Biotechnology Ignition Grant",
                    "SAMRIDH",
                    "iDEX",
                  ];

                  const featured = names
                    .map((name) =>
                      schemes.find((scheme) =>
                        getName(scheme)
                          .toLowerCase()
                          .includes(name.toLowerCase())
                      )
                    )
                    .filter(
                      (scheme, index, array) =>
                        scheme &&
                        array.findIndex(
                          (item) =>
                            item &&
                            getSlug(item) === getSlug(scheme)
                        ) === index
                    );

                  return (
                    <SchemeGrid
                      items={featured}
                      loading={loading}
                      onOpen={openScheme}
                      compareList={compareList}
                      onCompare={toggleCompare}
                    />
                  );
                })()}
              </section>

              <section className="siq-original-section">
                <div className="siq-original-section-heading">
                  <div>
                    <span className="siq-eyebrow">
                      EXPLORE THE WIDER ECOSYSTEM
                    </span>
                    <h2>Beyond central schemes</h2>
                    <p>
                      Discover regional programmes and organisations
                      supporting founders.
                    </p>
                  </div>
                </div>

                <div className="siq-original-start-grid">
                  {[
                    {
                      icon: "⌖",
                      title: "State & UT schemes",
                      desc: "Explore regional policies and incentives.",
                      label: "Explore states ↗",
                      page: "state-schemes",
                    },
                    {
                      icon: "◇",
                      title: "Incubators directory",
                      desc: "Find organisations that support founders.",
                      label: "Find incubators ↗",
                      page: "incubators",
                    },
                    {
                      icon: "▤",
                      title: "PSU & regulator programmes",
                      desc: "Explore public-sector startup opportunities.",
                      label: "Explore programmes ↗",
                      page: "psu",
                    },
                    {
                      icon: "↗",
                      title: "State startup portals",
                      desc: "Browse regional resources and startup portals.",
                      label: "View portals ↗",
                      page: "state-portals",
                    },
                  ].map((item) => (
                    <button
                      className="siq-original-start-card"
                      key={item.title}
                      onClick={() => navigate(item.page)}
                    >
                      <span className="siq-original-card-icon">
                        {item.icon}
                      </span>
                      <strong>{item.title}</strong>
                      <p>{item.desc}</p>
                      <span className="siq-original-card-link">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "schemes" && (
            <section className="siq-module-card">
              <div className="siq-module-header">
                <div>
                  <div className="siq-eyebrow">SEARCH DIRECTORY</div>
                  <h2>Explore startup schemes</h2>
                </div>
                <span>
                  {loading
                    ? "Loading…"
                    : `${filteredSchemes.length} results`}
                </span>
              </div>

              <div className="siq-filter-panel">
                <label className="siq-search-box">
                  <span>⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, sector or keyword..."
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </label>

                <div className="siq-filter-row">
                  <label>
                    <span>Type of support</span>
                    <select
                      value={supportFilter}
                      onChange={(event) =>
                        setSupportFilter(event.target.value)
                      }
                    >
                      <option value="">All support types</option>
                      {supportOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Startup stage</span>
                    <select
                      value={stageFilter}
                      onChange={(event) =>
                        setStageFilter(event.target.value)
                      }
                    >
                      <option value="">All stages</option>
                      {stageOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Sector</span>
                    <select
                      value={sectorFilter}
                      onChange={(event) =>
                        setSectorFilter(event.target.value)
                      }
                    >
                      <option value="">All sectors</option>
                      {sectorOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="siq-filter-footer">
                  <button
                    className="siq-text-button"
                    onClick={clearFilters}
                  >
                    Clear all filters
                  </button>

                  <div className="siq-view-switch">
                    <button
                      className={view === "cards" ? "active" : ""}
                      onClick={() => setView("cards")}
                    >
                      Cards
                    </button>
                    <button
                      className={view === "table" ? "active" : ""}
                      onClick={() => setView("table")}
                    >
                      Table
                    </button>
                  </div>
                </div>
              </div>

              {view === "cards" ? (
                <SchemeGrid
                  items={filteredSchemes}
                  loading={loading}
                  onOpen={openScheme}
                  compareList={compareList}
                  onCompare={toggleCompare}
                />
              ) : (
                <div className="siq-table-wrap">
                  <table className="siq-table">
                    <thead>
                      <tr>
                        <th>Scheme</th>
                        <th>Support type</th>
                        <th>Startup stage</th>
                        <th>Sector</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSchemes.map((item, index) => (
                        <tr key={getSlug(item) || index}>
                          <td>
                            <strong>{getName(item)}</strong>
                            <p>{getDescription(item)}</p>
                          </td>
                          <td>
                            {getCategories(item, supportKeys) || "—"}
                          </td>
                          <td>
                            {getCategories(item, stageKeys) || "—"}
                          </td>
                          <td>
                            {getCategories(item, sectorKeys) || "—"}
                          </td>
                          <td>
                            <button
                              className="siq-text-button"
                              onClick={() => openScheme(item)}
                            >
                              View details →
                            </button>
                            <button
                              className="siq-compare-chip"
                              onClick={() => toggleCompare(item)}
                            >
                              {compareList.some(
                                (x) => getSlug(x) === getSlug(item)
                              )
                                ? "✓ Added"
                                : "+ Compare"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredSchemes.length === 0 && (
                    <EmptyState message="No schemes match these filters." />
                  )}
                </div>
              )}
            </section>
          )}

          {page === "detail" && selectedScheme && (
            <section className="siq-module-card">
              <button
                className="siq-text-button"
                onClick={() => navigate("schemes")}
              >
                ← Back to schemes
              </button>

              {detailLoading ? (
                <div className="siq-loading-grid">
                  <div className="siq-skeleton" />
                </div>
              ) : (
                <>
                  {detailError && (
                    <div className="siq-alert" role="alert">
                      Could not load full details: {detailError}
                    </div>
                  )}

                  <div className="siq-detail-heading">
                    <div className="siq-eyebrow">
                      STARTUP SUPPORT PROGRAMME
                    </div>
                    <h2>{getName(selectedScheme)}</h2>
                    <p>{getDescription(selectedScheme)}</p>
                  </div>

                  <div className="siq-detail-grid">
                    <DetailField
                      title="Support type"
                      value={getCategories(selectedScheme, supportKeys)}
                    />
                    <DetailField
                      title="Startup stage"
                      value={getCategories(selectedScheme, stageKeys)}
                    />
                    <DetailField
                      title="Sector"
                      value={getCategories(selectedScheme, sectorKeys)}
                    />
                    <DetailField
                      title="Eligibility"
                      value={read(
                        selectedScheme,
                        "eligibility",
                        "eligibilityCriteria",
                        "whoCanApply"
                      )}
                    />
                    <DetailField
                      title="Benefits"
                      value={read(
                        selectedScheme,
                        "benefits",
                        "supportProvided",
                        "assistance"
                      )}
                    />
                    <DetailField
                      title="Application process"
                      value={read(
                        selectedScheme,
                        "howToApply",
                        "applicationProcess",
                        "application"
                      )}
                    />
                    <DetailField
                      title="Implementing agency"
                      value={read(
                        selectedScheme,
                        "implementingAgency",
                        "ministry",
                        "provider"
                      )}
                    />
                    <DetailField
                      title="Official website"
                      value={read(
                        selectedScheme,
                        "officialUrl",
                        "website",
                        "url",
                        "applyUrl"
                      )}
                      link
                    />
                  </div>

                  <button
                    className="siq-compare-chip"
                    onClick={() => toggleCompare(selectedScheme)}
                  >
                    {compareList.some(
                      (x) => getSlug(x) === getSlug(selectedScheme)
                    )
                      ? "✓ Added to comparison"
                      : "+ Add to comparison"}
                  </button>
                </>
              )}
            </section>
          )}

          {page === "detail" && !selectedScheme && (
            <EmptyState
              message="No scheme is selected. Return to the directory and choose a scheme."
              action={() => navigate("schemes")}
              actionLabel="Browse schemes"
            />
          )}

          {page === "finder" && (
            <SchemeFinder
              onOpenScheme={openScheme}
              onBrowseAll={() => {
                clearFilters();
                navigate("schemes");
              }}
              onCompareSchemes={(items) => {
                setCompareList(items.slice(0, 3));
                navigate("compare");
              }}
            />
          )}

          {page === "needs" && (
            <NeedsIndex onOpenScheme={openScheme} />
          )}

          {page === "lifecycle" && (
            <LifecyclePanel onChoose={goToSearch} />
          )}

          {page === "compare" && (
            <section className="siq-module-card">
              <div className="siq-module-header">
                <div>
                  <div className="siq-eyebrow">SIDE-BY-SIDE REVIEW</div>
                  <h2>Your comparison</h2>
                </div>
                <span>{compareList.length} / 3 selected</span>
              </div>

              <p className="siq-muted">
                Compare available information for up to three schemes.
                Confirm current details with official programme sources.
              </p>

              {compareList.length === 0 ? (
                <EmptyState
                  message="No schemes selected yet. Open the directory and choose Add to comparison."
                  action={() => navigate("schemes")}
                  actionLabel="Browse schemes"
                />
              ) : (
                <>
                  <div className="siq-compare-grid">
                    {compareList.map((item) => (
                      <article
                        className="siq-compare-card"
                        key={getSlug(item)}
                      >
                        <button
                          className="siq-remove"
                          onClick={() => toggleCompare(item)}
                          aria-label={`Remove ${getName(item)}`}
                        >
                          ×
                        </button>
                        <h3>{getName(item)}</h3>
                        <p>{getDescription(item)}</p>
                        <button
                          className="siq-text-button"
                          onClick={() => openScheme(item)}
                        >
                          View details →
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className="siq-table-wrap">
                    <table className="siq-table">
                      <thead>
                        <tr>
                          <th>Information</th>
                          {compareList.map((item) => (
                            <th key={getSlug(item)}>
                              {getName(item)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Support type", supportKeys],
                          ["Stage", stageKeys],
                          ["Sector", sectorKeys],
                          [
                            "Eligibility",
                            [
                              "eligibility",
                              "eligibilityCriteria",
                              "whoCanApply",
                            ],
                          ],
                          [
                            "Benefits",
                            ["benefits", "supportProvided", "assistance"],
                          ],
                          [
                            "How to apply",
                            [
                              "howToApply",
                              "applicationProcess",
                              "application",
                            ],
                          ],
                        ].map(([label, keys]) => (
                          <tr key={label}>
                            <td>
                              <strong>{label}</strong>
                            </td>
                            {compareList.map((item) => (
                              <td key={getSlug(item)}>
                                {getCategories(item, keys) ||
                                  "Not available in current data"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <button
                className="siq-secondary-button"
                onClick={() => navigate("schemes")}
              >
                + Add schemes
              </button>
            </section>
          )}

          {(page === "states" ||
            page === "state-schemes" ||
            page === "state-portals") && (
            <section className="siq-module-card">
              <div className="siq-module-header">
                <div>
                  <div className="siq-eyebrow">REGIONAL ECOSYSTEMS</div>
                  <h2>
                    {page === "state-portals"
                      ? "State startup portals"
                      : "States and Union Territories"}
                  </h2>
                </div>
                <span>{states.length} records</span>
              </div>

              <p className="siq-muted">
                Information shown here is based on the records returned
                by your API. Verify official portal links before applying.
              </p>

              <div className="siq-simple-grid">
                {states.map((item, index) => {
                  const url = read(
                    item,
                    "portal",
                    "website",
                    "url",
                    "officialUrl"
                  );

                  return (
                    <article
                      className="siq-simple-card"
                      key={
                        read(item, "state", "name", "slug", "_id") ||
                        index
                      }
                    >
                      <span className="siq-simple-icon">⌖</span>
                      <h3>
                        {read(
                          item,
                          "state",
                          "name",
                          "stateName",
                          "title"
                        ) || "State / UT"}
                      </h3>
                      <p>
                        {read(
                          item,
                          "description",
                          "summary",
                          "policy"
                        ) ||
                          "Explore regional startup support and official resources."}
                      </p>
                      {url && /^https?:\/\//i.test(url) && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Official portal ↗
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>

              {!loading && states.length === 0 && (
                <EmptyState message="No state records were returned by the API." />
              )}
            </section>
          )}

          {page === "incubators" && (
            <IncubatorPanel
              incubators={incubators}
              loading={loading}
            />
          )}

          {page === "psu" && (
            <section className="siq-module-card">
              <div className="siq-eyebrow">
                PUBLIC-SECTOR SUPPORT
              </div>
              <h2>PSU &amp; regulator programmes</h2>
              <p className="siq-muted">
                Browse the current scheme directory for programmes
                from public-sector organisations and regulators.
              </p>
              <button
                className="siq-primary-button"
                onClick={() => goToSearch("PSU")}
              >
                Search PSU programmes →
              </button>
              <SchemeGrid
                items={schemes.filter((item) =>
                  /psu|public sector|regulator|defence innovation|iDEX|TDF/i.test(
                    [
                      getName(item),
                      getDescription(item),
                      getCategories(item, [
                        "provider",
                        "ministry",
                        "implementingAgency",
                      ]),
                    ].join(" ")
                  )
                )}
                loading={loading}
                onOpen={openScheme}
                compareList={compareList}
                onCompare={toggleCompare}
              />
            </section>
          )}

          <footer className="siq-footer">
            <span>
              StartupIQ <span>·</span> A clearer path to startup support
            </span>
            <span>
              Verify eligibility and application details with the official
              programme source.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function SchemeGrid({
  items,
  loading,
  onOpen,
  compareList,
  onCompare,
}) {
  if (loading) {
    return (
      <div className="siq-loading-grid">
        {[1, 2, 3].map((item) => (
          <div className="siq-skeleton" key={item} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        message="No schemes are available for this view. Check the API connection or try different filters."
      />
    );
  }

  return (
    <div className="siq-scheme-grid">
      {items.map((item, index) => {
        const slug = getSlug(item);
        const selected = compareList.some(
          (entry) => getSlug(entry) === slug
        );

        return (
          <article
            className="siq-scheme-card"
            key={slug || `${getName(item)}-${index}`}
          >
            <div className="siq-scheme-card-top">
              <span className="siq-scheme-icon">
                {["✳", "◇", "↗"][index % 3]}
              </span>
              <button
                className={`siq-compare-chip ${
                  selected ? "selected" : ""
                }`}
                onClick={() => onCompare(item)}
                title="Add or remove from comparison"
              >
                {selected ? "✓ Added" : "+ Compare"}
              </button>
            </div>

            <div className="siq-scheme-meta">
              {getCategories(item, supportKeys) || "STARTUP SUPPORT"}
            </div>

            <h3>{getName(item)}</h3>
            <p>{getDescription(item)}</p>

            <div className="siq-card-tags">
              {getCategories(item, stageKeys) && (
                <span>{getCategories(item, stageKeys)}</span>
              )}
              {getCategories(item, sectorKeys) && (
                <span>{getCategories(item, sectorKeys)}</span>
              )}
            </div>

            <button
              className="siq-card-link"
              onClick={() => onOpen(item)}
            >
              Explore scheme <span>↗</span>
            </button>
          </article>
        );
      })}
    </div>
  );
}

function DetailField({ title, value, link }) {
  if (!value) {
    return (
      <div className="siq-detail-field">
        <h3>{title}</h3>
        <p className="siq-muted">
          Not available in the current record.
        </p>
      </div>
    );
  }

  const textValue =
    typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);

  const safeUrl =
    link &&
    typeof value === "string" &&
    /^https?:\/\//i.test(value.trim());

  return (
    <div className="siq-detail-field">
      <h3>{title}</h3>
      {safeUrl ? (
        <a href={value} target="_blank" rel="noreferrer">
          {value} ↗
        </a>
      ) : (
        <p>{textValue}</p>
      )}
    </div>
  );
}

function EmptyState({ message, action, actionLabel }) {
  return (
    <div className="siq-empty-state">
      <span>✳</span>
      <p>{message}</p>
      {action && (
        <button
          className="siq-primary-button"
          onClick={action}
        >
          {actionLabel || "Continue"} →
        </button>
      )}
    </div>
  );
}

function LifecyclePanel({ onChoose }) {
  const stages = [
    [
      "I",
      "Ideation",
      "Validate your idea and explore early support.",
      "ideation",
    ],
    [
      "P",
      "Prototype / PoC",
      "Build and test a proof of concept.",
      "prototype",
    ],
    [
      "S",
      "Seed / Early-Stage",
      "Develop your product and begin operations.",
      "seed",
    ],
    [
      "G",
      "Growth / Scaling",
      "Expand operations and reach new markets.",
      "growth",
    ],
    [
      "M",
      "Market Access & IP",
      "Protect innovation and access markets.",
      "market access",
    ],
  ];

  return (
    <section className="siq-module-card">
      <div className="siq-eyebrow">FROM IDEA TO SCALE</div>
      <h2>Choose your startup stage</h2>
      <p className="siq-muted">
        Select a stage to search the scheme directory. Results depend
        on the descriptions and metadata in your database.
      </p>

      <div className="siq-original-stage-grid">
        {stages.map(([code, name, desc, term]) => (
          <button
            className="siq-original-stage-card"
            key={code}
            onClick={() => onChoose(term)}
          >
            <span className="siq-original-stage-code">{code}</span>
            <strong>{name}</strong>
            <p>{desc}</p>
            <span className="siq-original-card-link">
              Explore schemes →
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function IncubatorPanel({ incubators, loading }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");

  const stateOptions = [
    ...new Set(
      incubators
        .map((item) => read(item, "state"))
        .filter(Boolean)
    ),
  ].sort();

  const filtered = incubators.filter((item) => {
    const text = [
      read(item, "name", "title"),
      read(item, "city"),
      read(item, "state"),
      read(item, "type"),
      getCategories(item, ["sectors", "sector"]),
      read(item, "host", "supportedBy"),
    ]
      .join(" ")
      .toLowerCase();

    return (
      text.includes(query.toLowerCase()) &&
      (!state || read(item, "state") === state)
    );
  });

  return (
    <section className="siq-module-card">
      <div className="siq-module-header">
        <div>
          <div className="siq-eyebrow">FIND YOUR ECOSYSTEM</div>
          <h2>Incubator directory</h2>
        </div>
        <span>
          {loading ? "Loading…" : `${filtered.length} results`}
        </span>
      </div>

      <div className="siq-filter-row">
        <label className="siq-search-box">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, city, sector…"
          />
        </label>

        <label>
          <span>State</span>
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            {stateOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="siq-simple-grid">
        {filtered.map((item, index) => {
          const url = read(item, "website", "url", "officialUrl");

          return (
            <article
              className="siq-simple-card"
              key={read(item, "_id", "id", "name") || index}
            >
              <span className="siq-simple-icon">◇</span>
              <h3>{read(item, "name", "title") || "Incubator"}</h3>

              <p>
                {[
                  read(item, "city"),
                  read(item, "state"),
                  read(item, "type"),
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Startup incubation and ecosystem support."}
              </p>

              <p>{getCategories(item, ["sectors", "sector"])}</p>

              {url && /^https?:\/\//i.test(url) && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit website ↗
                </a>
              )}
            </article>
          );
        })}
      </div>

      {!loading && !filtered.length && (
        <EmptyState message="No incubators match your search." />
      )}
    </section>
  );

}
