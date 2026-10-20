
import React from "react";
import "./SchemeDetail.css";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function asList(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(asList);
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  if (isObject(value)) return Object.values(value).flatMap(asList);
  return [String(value)];
}

function firstValue(...values) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0)
  );
}

function safeHttpUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normaliseLink(item) {
  if (typeof item === "string") {
    const url = safeHttpUrl(item);
    return url ? { label: "Open resource", url } : null;
  }

  if (!isObject(item)) return null;

  const url = safeHttpUrl(
    firstValue(item.url, item.href, item.link, item.website, item.pdfUrl)
  );

  if (!url) return null;

  return {
    label: firstValue(
      item.label,
      item.title,
      item.name,
      item.type,
      item.text,
      "Open resource"
    ),
    url,
  };
}

function SectionList({ title, value, emptyText }) {
  const items = asList(value);

  return (
    <section className="siq-sd-section">
      <h3>{title}</h3>
      {items.length ? (
        <ul className="siq-sd-list">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="siq-sd-muted">{emptyText || "Not available in this record."}</p>
      )}
    </section>
  );
}

function ResourceLinks({ links }) {
  const normalised = asList(links)
    .map(normaliseLink)
    .filter(Boolean);

  return (
    <section className="siq-sd-section">
      <h3>Key links</h3>
      {normalised.length ? (
        <div className="siq-sd-link-grid">
          {normalised.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              className="siq-sd-resource"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{link.label}</span>
              <span aria-hidden="true">↗</span>
              <small>{new URL(link.url).hostname}</small>
            </a>
          ))}
        </div>
      ) : (
        <p className="siq-sd-muted">
          No additional verified resource links are available in this record.
        </p>
      )}
    </section>
  );
}

export default function SchemeDetail({
  scheme,
  allSchemes = [],
  onBack,
  onOpenRelated,
  onCompare,
  isCompared = false,
}) {
  if (!scheme) return null;

  // Original scheme record and imported reference content.
  const ref = scheme.referenceContent || {};
  const imported = scheme.referenceDetails || {};

  const name = firstValue(
    scheme.name,
    scheme.title,
    scheme.shortName,
    "Government scheme"
  );

  const description = firstValue(
    ref.whatIsThis,
    scheme.whatIsThis,
    scheme.description,
    scheme.shortDescription,
    scheme.tagline,
    imported.description,
    imported.metaDescription
  );

  const ministry = firstValue(
    scheme.ministry,
    scheme.provider,
    imported.provider
  );

  const funding = firstValue(
    scheme.howMuch,
    scheme.maxFunding,
    scheme.headlineAmount,
    scheme.fundingAmount
  );

  const officialUrl = safeHttpUrl(
    firstValue(
      imported.officialUrl,
      ref.officialUrl,
      scheme.officialUrl,
      scheme.officialWebsite,
      scheme.website,
      scheme.url
    )
  );

  const sourceLinks = firstValue(
    ref.links,
    scheme.links,
    scheme.keyLinks,
    scheme.resources,
    []
  );

  const links = [
    ...(Array.isArray(sourceLinks) ? sourceLinks : [sourceLinks]),
    ...(officialUrl ? [{ label: "Official website", url: officialUrl }] : []),
  ];

  const relatedValues = asList(
    firstValue(ref.relatedSchemes, scheme.relatedSchemes, scheme.related, [])
  );

  const related = relatedValues
    .map((item) => {
      if (isObject(item)) {
        const key = firstValue(item.slug, item.schemeSlug, item.name, item.title);
        return allSchemes.find(
          (candidate) =>
            candidate.slug === key ||
            candidate.name === key ||
            candidate.shortName === key
        );
      }

      return allSchemes.find(
        (candidate) =>
          candidate.slug === item ||
          candidate.name === item ||
          candidate.shortName === item
      );
    })
    .filter(Boolean)
    .filter((candidate, index, array) =>
      array.findIndex((other) => other.slug === candidate.slug) === index
    );

  const stages = asList(firstValue(scheme.stages, scheme.stageFocus, scheme.stage));
  const sectors = asList(firstValue(scheme.sectors, scheme.sector));
  const supportTypes = asList(
    firstValue(scheme.supportTypes, scheme.supportType, scheme.category)
  );

  return (
    <main className="siq-sd-page">
      <button className="siq-sd-back" type="button" onClick={onBack}>
        ← Back to schemes
      </button>

      <header className="siq-sd-header">
        <div>
          <span className="siq-sd-eyebrow">GOVERNMENT SUPPORT PROGRAMME</span>
          <h1>{name}</h1>
          {ministry && <p className="siq-sd-ministry">{ministry}</p>}
          {description && <p className="siq-sd-description">{description}</p>}
        </div>
      </header>

      {(supportTypes.length > 0 || stages.length > 0 || sectors.length > 0) && (
        <div className="siq-sd-tags">
          {supportTypes.map((tag, i) => (
            <span key={`support-${i}`}>{tag}</span>
          ))}
          {stages.map((tag, i) => (
            <span key={`stage-${i}`}>{tag}</span>
          ))}
          {sectors.map((tag, i) => (
            <span key={`sector-${i}`}>{tag}</span>
          ))}
        </div>
      )}

      <div className="siq-sd-facts">
        <div>
          <span>TYPE OF SUPPORT</span>
          <strong>{supportTypes.join(", ") || "Not specified"}</strong>
        </div>
        <div>
          <span>BEST SUITED FOR</span>
          <strong>{asList(scheme.bestSuitedFor).join(", ") || "See eligibility"}</strong>
        </div>
        <div>
          <span>FUNDING / BENEFIT</span>
          <strong>{funding || "See scheme guidelines"}</strong>
        </div>
        <div>
          <span>STARTUP STAGE</span>
          <strong>{stages.join(", ") || "Not specified"}</strong>
        </div>
      </div>

      <div className="siq-sd-content-grid">
        <SectionList
          title="What is this scheme?"
          value={firstValue(ref.whatIsThis, scheme.whatIsThis, description)}
        />
        <SectionList
          title="Objectives"
          value={firstValue(ref.objectives, scheme.objectives)}
        />
        <SectionList
          title="Who can apply?"
          value={firstValue(ref.eligibility, scheme.eligibility, scheme.eligibilityCriteria)}
        />
        <SectionList
          title="What do you get?"
          value={firstValue(ref.benefits, scheme.benefits, scheme.supportProvided)}
        />
        <SectionList
          title="How to apply"
          value={firstValue(ref.howToApply, scheme.howToApply, scheme.applicationProcess)}
        />
      </div>

      <ResourceLinks links={links} />

      <section className="siq-sd-section">
        <h3>Official portal</h3>
        {officialUrl ? (
          <a
            className="siq-sd-primary-link"
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Go to official portal ↗
          </a>
        ) : (
          <p className="siq-sd-muted">
            An official portal URL has not been verified for this scheme yet.
          </p>
        )}
      </section>

      <section className="siq-sd-section">
        <h3>Related schemes</h3>
        {related.length ? (
          <div className="siq-sd-related-grid">
            {related.map((item) => (
              <button
                key={item.slug || item._id || item.name}
                type="button"
                className="siq-sd-related-card"
                onClick={() => onOpenRelated?.(item)}
              >
                <strong>{item.name || item.shortName}</strong>
                <span>View scheme details →</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="siq-sd-muted">
            Related schemes are not listed in the current record.
          </p>
        )}
      </section>

      <footer className="siq-sd-footer">
        Scheme details are provided for guidance. Always verify current eligibility,
        application windows and requirements on the official portal before applying.
      </footer>

      {onCompare && (
        <button
          type="button"
          className="siq-sd-compare"
          onClick={() => onCompare(scheme)}
        >
          {isCompared ? "Remove from comparison" : "Add to comparison"} ↗
        </button>
      )}
    </main>
  );
}
