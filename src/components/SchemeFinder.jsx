
import { useEffect, useMemo, useState } from "react";
import "./SchemeFinder.css";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const QUESTIONS = [
  {
    id: 1,
    title:
      "Are you a student or early-stage researcher / aspiring entrepreneur (not yet a registered startup)?",
    subtitle: "Let's first understand where you are in your journey.",
    branches: [
      {
        label: "Yes, I'm a student or aspiring entrepreneur",
        shortLabel: "Student / aspiring entrepreneur",
        note: "Explore fellowships and innovation programmes for students and aspiring entrepreneurs.",
        schemes: ["NIDHI-EIR", "E-YUVA", "SITARE", "Atal Tinkering Labs"],
      },
      {
        label: "No, I'm already working on or running a startup",
        shortLabel: "Working on a startup",
        note: "Continue to identify schemes based on your startup's stage and needs.",
        schemes: [],
      },
    ],
  },
  {
    id: 2,
    title: "What is your current startup stage?",
    subtitle: "Choose the option that best describes your progress.",
    branches: [
      {
        label: "Idea / PoC stage — I need grants to get started",
        shortLabel: "Idea / Proof of Concept",
        note: "Schemes for early ideas, proof of concept and initial validation.",
        schemes: ["BIG", "PRAYAS 2.0", "RKVY", "SPARSH", "GREAT"],
      },
      {
        label: "Prototype and beyond — I'm ready to build",
        shortLabel: "Prototype and beyond",
        note: "Support for prototype development, testing and taking a product forward.",
        schemes: [
          "SISFS",
          "NIDHI-SSP",
          "TIDE 2.0",
          "iDEX",
          "IN-SPACe Seed Fund",
          "DCIS",
        ],
      },
    ],
  },
  {
    id: 3,
    title: "What type of support do you primarily need?",
    subtitle: "Select the kind of financial support you're looking for.",
    branches: [
      {
        label: "Grant — funding that generally does not need repayment",
        shortLabel: "Grant funding",
        note: "Explore grant programmes. Check each scheme's conditions and eligibility before applying.",
        schemes: [
          "SISFS",
          "BIG",
          "iDEX",
          "ADITI",
          "PRAYAS 2.0",
          "DCIS",
          "IN-SPACe Seed Fund",
          "RKVY",
          "SPARSH",
          "GREAT",
          "NQM",
        ],
      },
      {
        label: "Equity investment — funding in exchange for a stake",
        shortLabel: "Equity investment",
        note: "Explore equity and investment-linked funding opportunities.",
        schemes: [
          "FFS",
          "Startup India FoF 2.0",
          "AcE",
          "AgriSURE",
          "BIRAC SEED",
          "LEAP Fund",
          "SAMRIDH",
          "Antariksh VCF",
          "NIDHI-SSP",
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Do you need a loan / credit or IP / other support?",
    subtitle: "Choose the support that would help your business most.",
    branches: [
      {
        label: "Loan / credit guarantee",
        shortLabel: "Loan / credit",
        note: "Programmes related to loans and credit guarantees.",
        schemes: ["CGSS", "CGTMSE", "PMMY", "Stand Up India"],
      },
      {
        label: "IP protection / market access",
        shortLabel: "IP / market access",
        note: "Support for intellectual property and accessing government buyers.",
        schemes: ["SIPP", "GeM Startup Runway"],
      },
    ],
  },
  {
    id: 5,
    title: "Are you in a specific strategic or deep-tech sector?",
    subtitle: "Choose the closest match. You can also skip this question.",
    branches: [
      {
        label: "Defence / allied technologies",
        shortLabel: "Defence",
        note: "Schemes for defence innovation and strategic technologies.",
        schemes: ["iDEX", "ADITI", "TDF"],
      },
      {
        label: "Space",
        shortLabel: "Space",
        note: "Support for space technology and space-sector businesses.",
        schemes: ["IN-SPACe Seed Fund", "Antariksh VCF", "Space TAF"],
      },
      {
        label: "Biotech / allied",
        shortLabel: "Biotech",
        note: "Programmes for biotechnology, healthcare and life-science innovation.",
        schemes: ["BIG", "BIRAC SEED", "LEAP Fund", "SPARSH", "AcE", "SBIRI"],
      },
      {
        label: "Agriculture / food",
        shortLabel: "Agriculture / food",
        note: "Support for agritech, agriculture and food-sector startups.",
        schemes: ["RKVY", "AgriSURE", "BHARATI"],
      },
      {
        label: "Semiconductor / electronics",
        shortLabel: "Semiconductors",
        note: "Programmes for chip design and electronics innovation.",
        schemes: ["DLI", "Chips to Startup (C2S)", "GENESIS"],
      },
      {
        label: "Quantum technology",
        shortLabel: "Quantum",
        note: "Support for quantum technology startups and research.",
        schemes: ["NQM Startup Support"],
      },
    ],
  },
];

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function schemeName(scheme) {
  return scheme?.name || scheme?.title || scheme?.shortName || "Scheme";
}

function getSchemeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.schemes)) return payload.schemes;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getSchemeDescription(scheme) {
  return (
    scheme?.tagline ||
    scheme?.shortDescription ||
    scheme?.description ||
    scheme?.whatIsThis ||
    "Open the scheme details to learn about its support and eligibility requirements."
  );
}

export default function SchemeFinder({
  onOpenScheme,
  onBrowseSchemes,
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showTree, setShowTree] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSchemes() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`${API_BASE}/schemes`);

        if (!response.ok) {
          throw new Error(`Schemes API returned ${response.status}`);
        }

        const payload = await response.json();
        if (!cancelled) {
          setSchemes(getSchemeList(payload));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            "Scheme descriptions could not be loaded. You can still use the question flow; check that your backend is running."
          );
          setSchemes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSchemes();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = QUESTIONS[step];
  const currentAnswer = answers[step];

  const schemeIndex = useMemo(() => {
    const index = new Map();

    schemes.forEach((scheme) => {
      const keys = [
        scheme.name,
        scheme.shortName,
        scheme.slug,
        scheme.full,
      ];

      keys.forEach((key) => {
        if (key) index.set(normalize(key), scheme);
      });
    });

    return index;
  }, [schemes]);

  const results = useMemo(() => {
    const collected = new Map();

    Object.entries(answers).forEach(([questionIndex, branchIndex]) => {
      const branch = QUESTIONS[Number(questionIndex)]?.branches[branchIndex];
      if (!branch) return;

      branch.schemes.forEach((name) => {
        const key = normalize(name);
        if (!collected.has(key)) {
          const scheme = schemeIndex.get(key) ||
            schemes.find((item) =>
              [item.name, item.shortName, item.slug, item.full].some(
                (field) =>
                  field &&
                  (normalize(field) === key ||
                    normalize(field).includes(key) ||
                    key.includes(normalize(field)))
              )
            );

          collected.set(key, {
            key,
            label: name,
            scheme,
          });
        }
      });
    });

    return Array.from(collected.values());
  }, [answers, schemeIndex, schemes]);

  const completedCount = Object.keys(answers).length;
  const isComplete = completedCount === QUESTIONS.length;

  function chooseAnswer(branchIndex) {
    setAnswers((previous) => {
      const next = { ...previous, [step]: branchIndex };

      // If an earlier answer changes, clear later answers so the journey
      // stays consistent with the user's latest selection.
      Object.keys(next).forEach((key) => {
        if (Number(key) > step) delete next[key];
      });

      return next;
    });
  }

  function goNext() {
    if (currentAnswer === undefined) return;
    if (step < QUESTIONS.length - 1) {
      setStep((value) => value + 1);
    }
  }

  function goBack() {
    if (step > 0) setStep((value) => value - 1);
  }

  function restart() {
    setStep(0);
    setAnswers({});
    setShowTree(false);
  }

  function openScheme(item) {
    if (onOpenScheme && item.scheme) {
      onOpenScheme(item.scheme);
      return;
    }

    if (onBrowseSchemes) {
      onBrowseSchemes(item.label);
      return;
    }

    // Fallback: take the user to the existing schemes page.
    window.location.hash = `schemes?search=${encodeURIComponent(item.label)}`;
  }

  function browseAll() {
    if (onBrowseSchemes) {
      onBrowseSchemes("");
    } else {
      window.location.hash = "schemes";
    }
  }

  return (
    <div className="sf-page">
      <header className="sf-heading">
        <div className="sf-eyebrow">
          <span className="sf-eyebrow-dot" />
          STARTUPIQ • FUNDING DISCOVERY
        </div>

        <h1>Scheme Finder</h1>
        <p className="sf-intro">
          Find government support for your startup in five simple questions.
          Discover grants, investment, credit and sector-specific programmes.
        </p>

        <div className="sf-heading-actions">
          <button
            className="sf-secondary-button"
            type="button"
            onClick={() => setShowTree((value) => !value)}
          >
            {showTree ? "Hide full decision tree" : "View full decision tree"}
            <span aria-hidden="true">{showTree ? "−" : "↗"}</span>
          </button>

          <button className="sf-text-button" type="button" onClick={restart}>
            Start again
          </button>
        </div>
      </header>

      {showTree && (
        <section className="sf-tree" aria-label="Full decision tree">
          <div className="sf-section-heading">
            <div>
              <span className="sf-kicker">REFERENCE</span>
              <h2>The full decision tree</h2>
              <p>
                Explore all five questions and the schemes associated with
                each answer.
              </p>
            </div>
          </div>

          <div className="sf-tree-list">
            {QUESTIONS.map((question, questionIndex) => (
              <article className="sf-tree-question" key={question.id}>
                <div className="sf-tree-number">Q{question.id}</div>
                <div className="sf-tree-content">
                  <h3>{question.title}</h3>
                  <div className="sf-tree-branches">
                    {question.branches.map((branch, branchIndex) => (
                      <div className="sf-tree-branch" key={branch.label}>
                        <strong>{branch.label}</strong>
                        {branch.schemes.length > 0 ? (
                          <div className="sf-chips">
                            {branch.schemes.map((name) => (
                              <span className="sf-chip" key={name}>
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="sf-muted">
                            Continue to the next question.
                          </p>
                        )}

                        <button
                          type="button"
                          className="sf-inline-link"
                          onClick={() => {
                            setStep(questionIndex);
                            chooseAnswerFromTree(
                              questionIndex,
                              branchIndex
                            );
                            setShowTree(false);
                          }}
                        >
                          Choose this answer →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="sf-workspace">
        <div className="sf-wizard-card">
          <div className="sf-progress-header">
            <div>
              <span className="sf-kicker">PERSONALISED DISCOVERY</span>
              <h2>Find the right support</h2>
            </div>
            <span className="sf-step-count">
              {step + 1} <span>/ {QUESTIONS.length}</span>
            </span>
          </div>

          <div
            className="sf-progress-track"
            role="progressbar"
            aria-label="Question progress"
            aria-valuemin={0}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={step + 1}
          >
            <div
              className="sf-progress-value"
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>

          <div className="sf-question-block">
            <span className="sf-question-label">QUESTION {step + 1}</span>
            <h3>{currentQuestion.title}</h3>
            <p>{currentQuestion.subtitle}</p>
          </div>

          <div className="sf-options">
            {currentQuestion.branches.map((branch, index) => {
              const selected = currentAnswer === index;

              return (
                <button
                  className={`sf-option ${selected ? "is-selected" : ""}`}
                  type="button"
                  key={branch.label}
                  onClick={() => chooseAnswer(index)}
                  aria-pressed={selected}
                >
                  <span className="sf-option-radio">
                    {selected ? <span /> : null}
                  </span>

                  <span className="sf-option-copy">
                    <strong>{branch.label}</strong>
                    <small>{branch.note}</small>
                  </span>

                  <span className="sf-option-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              );
            })}
          </div>

          {step === 4 && (
            <button
              type="button"
              className="sf-skip-button"
              onClick={() => {
                setAnswers((previous) => {
                  const next = { ...previous };
                  delete next[4];
                  return next;
                });
              }}
            >
              Clear sector answer
            </button>
          )}

          <div className="sf-wizard-footer">
            <button
              type="button"
              className="sf-back-button"
              onClick={goBack}
              disabled={step === 0}
            >
              ← Back
            </button>

            {step < QUESTIONS.length - 1 ? (
              <button
                type="button"
                className="sf-primary-button"
                onClick={goNext}
                disabled={currentAnswer === undefined}
              >
                Next question <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                type="button"
                className="sf-primary-button"
                onClick={() => {
                  if (currentAnswer !== undefined) {
                    document
                      .getElementById("sf-results")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                disabled={currentAnswer === undefined}
              >
                View my results <span aria-hidden="true">↓</span>
              </button>
            )}
          </div>
        </div>

        <aside className="sf-summary-card">
          <div className="sf-summary-icon" aria-hidden="true">✳</div>
          <span className="sf-kicker">YOUR JOURNEY</span>
          <h3>Your answers, your shortlist.</h3>
          <p>
            Each answer adds relevant schemes to your shortlist. A scheme may
            appear in more than one category, but it will only appear once in
            your results.
          </p>

          <div className="sf-summary-stats">
            <div>
              <strong>{completedCount}</strong>
              <span>Questions answered</span>
            </div>
            <div>
              <strong>{results.length}</strong>
              <span>Unique schemes found</span>
            </div>
          </div>

          <div className="sf-mini-steps">
            {QUESTIONS.map((question, index) => (
              <button
                type="button"
                key={question.id}
                className={`sf-mini-step ${
                  index === step ? "is-current" : ""
                } ${answers[index] !== undefined ? "is-done" : ""}`}
                onClick={() => setStep(index)}
              >
                <span className="sf-mini-step-number">
                  {answers[index] !== undefined ? "✓" : question.id}
                </span>
                <span>Question {question.id}</span>
                <span className="sf-mini-step-status">
                  {index === step
                    ? "Current"
                    : answers[index] !== undefined
                    ? "Answered"
                    : "Pending"}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="sf-results" id="sf-results">
        <div className="sf-results-header">
          <div>
            <span className="sf-kicker">YOUR SHORTLIST</span>
            <h2>
              {isComplete ? "Your scheme matches" : "Your potential matches"}
            </h2>
            <p>
              {isComplete
                ? "Based on the answers you selected. Review the official scheme details before applying."
                : "Your shortlist updates as you answer the questions."}
            </p>
          </div>

          <span className="sf-result-count">
            {results.length} {results.length === 1 ? "scheme" : "schemes"}
          </span>
        </div>

        {loadError && (
          <div className="sf-notice" role="status">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="sf-empty-state">
            <span className="sf-loading-dot" />
            Loading scheme information…
          </div>
        ) : results.length === 0 ? (
          <div className="sf-empty-state">
            <div className="sf-empty-icon">⌕</div>
            <h3>Your shortlist will appear here</h3>
            <p>
              Select an answer above to discover relevant government schemes.
            </p>
          </div>
        ) : (
          <div className="sf-results-grid">
            {results.map((item) => {
              const scheme = item.scheme;
              const name = scheme ? schemeName(scheme) : item.label;
              const description = scheme
                ? getSchemeDescription(scheme)
                : "This scheme is included in the original Scheme Finder decision tree. Open the scheme directory to view available details.";

              return (
                <article className="sf-scheme-card" key={item.key}>
                  <div className="sf-scheme-card-top">
                    <span className="sf-scheme-label">GOVERNMENT SCHEME</span>
                    <span className="sf-scheme-symbol" aria-hidden="true">↗</span>
                  </div>

                  <h3>{name}</h3>
                  <p>{description}</p>

                  {scheme?.ministry && (
                    <div className="sf-ministry">
                      <span>Administered by</span>
                      <strong>{scheme.ministry}</strong>
                    </div>
                  )}

                  <button
                    type="button"
                    className="sf-card-link"
                    onClick={() => openScheme(item)}
                  >
                    Explore scheme <span aria-hidden="true">→</span>
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <div className="sf-results-footer">
          <p>
            These are discovery suggestions, not a guarantee of eligibility.
            Scheme rules and application windows can change.
          </p>
          <button
            type="button"
            className="sf-secondary-button"
            onClick={browseAll}
          >
            Browse all schemes <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );

  function chooseAnswerFromTree(questionIndex, branchIndex) {
    setAnswers((previous) => {
      const next = { ...previous, [questionIndex]: branchIndex };
      Object.keys(next).forEach((key) => {
        if (Number(key) > questionIndex) delete next[key];
      });
      return next;
    });
  }
}
