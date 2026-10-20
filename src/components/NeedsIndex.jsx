
import { useEffect, useMemo, useState } from "react";
import { getNeedsIndex, getSchemes } from "../services/api";
import "./NeedsIndex.css";

function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function schemeMatches(item, schemes) {
  const target = normalise(item);
  const exact = schemes.find((scheme) =>
    [
      scheme.name,
      scheme.shortName,
      scheme.slug,
    ].some((name) => normalise(name || "") === target)
  );

  return exact || null;
}

export default function NeedsIndex({ onOpenScheme }) {
  const [needs, setNeeds] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [needsResponse, schemesResponse] =
          await Promise.all([
            getNeedsIndex(),
            getSchemes(),
          ]);

        if (!active) return;

        const needsPayload =
          needsResponse.data?.data ?? needsResponse.data;

        const schemePayload =
          schemesResponse.data?.data?.schemes ??
          schemesResponse.data?.schemes ??
          schemesResponse.data?.data ??
          schemesResponse.data;

        setNeeds(needsPayload);
        setSchemes(
          Array.isArray(schemePayload)
            ? schemePayload
            : []
        );
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              "Unable to load schemes. Please try again."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => {
    const query = normalise(search);

    return (needs?.rows || [])
      .map((row) => {
        const filterItems = (items = []) =>
          items.filter((name) =>
            normalise(name).includes(query)
          );

        return {
          ...row,
          startupSpecific: filterItems(
            row.startupSpecific
          ),
          startupRelevant: filterItems(
            row.startupRelevant
          ),
        };
      })
      .filter((row) => {
        if (!search.trim()) return true;

        return (
          normalise(row.need).includes(normalise(search)) ||
          normalise(row.needNote).includes(normalise(search)) ||
          row.startupSpecific.length > 0 ||
          row.startupRelevant.length > 0
        );
      });
  }, [needs, search]);

  if (loading) {
    return (
      <main className="siq-needs-page">
        <p role="status">Loading support categories…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="siq-needs-page">
        <h2>What do you need?</h2>
        <p role="alert">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="siq-needs-reset"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="siq-needs-page">
      <header className="siq-needs-header">
        <span className="siq-needs-eyebrow">
          STARTUPIQ · SUPPORT FINDER
        </span>

        <h1>What do you need?</h1>

        <p>
          {needs?.intro ||
            "Find government schemes based on the support your startup needs."}
        </p>

        <label
          className="siq-needs-search"
          htmlFor="needs-search"
        >
          <span aria-hidden="true">⌕</span>
          <input
            id="needs-search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search grants, equity, incubation…"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </label>
      </header>

      <div className="siq-needs-results">
        {rows.map((row) => (
          <section
            className="siq-needs-row"
            key={row.need}
          >
            <div className="siq-needs-category">
              <h2>{row.need}</h2>
              {row.needNote && <p>{row.needNote}</p>}
            </div>

            <div className="siq-needs-columns">
              {[
                {
                  title: "Startup-specific",
                  items: row.startupSpecific,
                  className: "specific",
                },
                {
                  title: "Startup-relevant",
                  items: row.startupRelevant,
                  className: "relevant",
                },
              ].map((group) => (
                <div
                  className={`siq-needs-group ${group.className}`}
                  key={group.title}
                >
                  <h3>{group.title}</h3>

                  {group.items.length ? (
                    <div className="siq-needs-pills">
                      {group.items.map((item) => {
                        const scheme = schemeMatches(
                          item,
                          schemes
                        );

                        return scheme ? (
                          <button
                            type="button"
                            key={item}
                            className="siq-needs-pill"
                            onClick={() =>
                              onOpenScheme?.(scheme)
                            }
                            title={`View ${scheme.name}`}
                          >
                            {item}
                            <span aria-hidden="true"> ↗</span>
                          </button>
                        ) : (
                          <span
                            className="siq-needs-pill unavailable"
                            key={item}
                            title="No exact matching scheme record found"
                          >
                            {item}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="siq-needs-empty">
                      No schemes listed in this category.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {!rows.length && (
          <p className="siq-needs-empty">
            No matching support categories found.
          </p>
        )}
      </div>

      <p className="siq-needs-disclaimer">
        Scheme matches are based on the supplied reference data.
        Check each scheme’s official portal for current eligibility
        and application requirements.
      </p>
    </main>
  );
}
