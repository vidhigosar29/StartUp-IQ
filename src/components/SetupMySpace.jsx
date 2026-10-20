
import { useState } from "react";
import "./SetupMySpace.css";

const businessTypes = [
  "Startup Founder",
  "Small or Medium Enterprise (SME)",
  "Home Bakery",
  "Jewellery Business",
  "Tailoring / Boutique",
  "Nail Artist / Beauty Business",
  "Other Business",
];

export default function SetupMySpace() {
  const [isOpen, setIsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    businessStage: "Just starting",
    description: "",
  });

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
    setSaved(false);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.businessName.trim() || !form.businessType) {
      alert("Please enter your business name and select a business type.");
      return;
    }

    localStorage.setItem(
      "startupiq_workspace",
      JSON.stringify(form)
    );

    setSaved(true);
  }
return (
    <>
      <button
        type="button"
        className="setup-space-card"
        onClick={() => {
          const existing = localStorage.getItem("startupiq_workspace");

          if (existing) {
            try {
              setForm(JSON.parse(existing));
              setSaved(false);
            } catch {
              // Start with the default form if saved data is invalid.
            }
          }

          setIsOpen(true);
        }}
      >
        
      </button>

      {isOpen && (
        <div
          className="setup-space-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            className="setup-space-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-space-heading"
          >
            <button
              type="button"
              className="setup-space-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close setup"
            >
              ×
            </button>

            <span className="setup-space-eyebrow">
              START WITH THE BASICS
            </span>
            <h2 id="setup-space-heading">Set up your space</h2>
            <p className="setup-space-intro">
              Tell us about your business so we can personalise your
              StartupIQ workspace.
            </p>

            <form onSubmit={handleSubmit}>
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                name="businessName"
                value={form.businessName}
                onChange={handleChange}
                placeholder="e.g. Cherry Bae"
                required
              />

              <label htmlFor="businessType">Business type</label>
              <select
                id="businessType"
                name="businessType"
                value={form.businessType}
                onChange={handleChange}
                required
              >
                <option value="">Choose your business type</option>
                {businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <label htmlFor="businessStage">Business stage</label>
              <select
                id="businessStage"
                name="businessStage"
                value={form.businessStage}
                onChange={handleChange}
              >
                <option>Just starting</option>
                <option>Planning to launch</option>
                <option>Already operating</option>
                <option>Growing my business</option>
              </select>

              <label htmlFor="description">
                What does your business do? (optional)
              </label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Briefly describe your business..."
                rows={3}
              />

              <button type="submit" className="setup-space-submit">
                Save my workspace <span>↗</span>
              </button>

              {saved && (
                <p className="setup-space-success" role="status">
                  ✓ Workspace details saved on this browser!
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
