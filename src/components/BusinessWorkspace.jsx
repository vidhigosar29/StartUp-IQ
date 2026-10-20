
import { useEffect, useState } from "react";
import axios from "axios";
import "./BusinessWorkspace.css";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/workspace`,
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("startupIQToken") ||
    localStorage.getItem("startupiq_token");

  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const sections = {
  product: {
    title: "Products & Menu",
    fields: [["name", "Product name"], ["category", "Category"], ["price", "Selling price"], ["cost", "Unit cost"], ["stock", "Stock quantity"], ["lowStockAt", "Low-stock threshold"]],
  },
  material: {
    title: "Inventory & Stock",
    fields: [["name", "Material name"], ["unit", "Unit"], ["quantity", "Quantity"], ["unitCost", "Cost per unit"], ["lowStockAt", "Low-stock threshold"]],
  },
  sale: {
    title: "Sales & Orders",
    fields: [["customer", "Customer"], ["product", "Product"], ["quantity", "Quantity"], ["unitPrice", "Price per unit"], ["total", "Total amount"], ["date", "Date"], ["paymentStatus", "Payment status"], ["paymentMethod", "Payment method"]],
  },
  expense: {
    title: "Expenses & Overhead",
    fields: [["category", "Category"], ["description", "Description"], ["amount", "Amount"], ["date", "Date"]],
  },
  customer: {
    title: "Customers & Dues",
    fields: [["name", "Customer name"], ["phone", "Phone"], ["email", "Email"], ["totalDue", "Outstanding due"]],
  },
  experiment: {
    title: "Growth Experiments",
    fields: [["name", "Experiment name"], ["hypothesis", "Hypothesis"], ["metric", "Success metric"], ["target", "Target"], ["status", "Status"], ["result", "Result / notes"]],
  },
};

const blank = (type) =>
  Object.fromEntries(sections[type].fields.map(([key]) => [key, ""]));

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function BusinessWorkspace({ onBack }) {
  const [section, setSection] = useState("dashboard");
  const [profile, setProfile] = useState({
    businessName: "",
    businessType: "Startup founder",
    businessStage: "Just starting",
    templateName: "Classic",
    description: "",
    accentColor: "#30483A",
  });
  const [records, setRecords] = useState([]);
  const [insights, setInsights] = useState(null);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProfile() {
    const response = await api.get("/profile");
    if (response.data.data) setProfile(response.data.data);
  }

  async function loadRecords(type = section) {
    if (sections[type]) {
      const response = await api.get(`/${type}`);
      setRecords(response.data.data || []);
    } else {
      setRecords([]);
    }

    if (type === "dashboard" || type === "insights") {
      const response = await api.get("/insights");
      setInsights(response.data.data);
    }
  }

  async function refresh() {
    setError("");
    setBusy(true);
    try {
      await loadProfile();
      await loadRecords(section);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load workspace. Check your login.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // Load initial data on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(type) {
    setSection(type);
    setForm({});
    setEditing(null);
    setSearch("");
    setError("");
    setMessage("");
    loadRecords(type).catch((err) =>
      setError(err.response?.data?.message || "Could not load records.")
    );
  }

  function addRecord() {
    setEditing(null);
    setForm(blank(section));
    setError("");
    setMessage("");
  }

  function editRecord(row) {
    const next = blank(section);
    for (const [key] of sections[section].fields) {
      next[key] = row[key] ?? "";
    }
    setForm(next);
    setEditing(row.id);
    setError("");
  }

  async function saveRecord(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const payload = { ...form };

      if (section === "sale" && !payload.total) {
        payload.total =
          Number(payload.quantity || 1) * Number(payload.unitPrice || 0);
      }

      if (editing) {
        await api.patch(`/${section}/${editing}`, payload);
        setMessage("Record updated.");
      } else {
        await api.post(`/${section}`, payload);
        setMessage("Record saved to MongoDB.");
      }

      setForm({});
      setEditing(null);
      await loadRecords(section);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save record.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(id) {
    if (!window.confirm("Delete this record permanently?")) return;

    try {
      await api.delete(`/${section}/${id}`);
      setMessage("Record deleted.");
      await loadRecords(section);
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete record.");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await api.put("/profile", profile);
      setProfile(response.data.data);
      setMessage("Workspace settings saved to MongoDB.");
      setSection("dashboard");
      await loadRecords("dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.append("file", file);

    try {
      setBusy(true);
      const response = await api.post(`/import/${section}`, body);
      setMessage(`${response.data.imported} records imported.`);
      await loadRecords(section);
    } catch (err) {
      setError(err.response?.data?.message || "CSV import failed.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  function exportCsv() {
    if (!records.length) {
      setMessage("No records to export.");
      return;
    }

    const keys = sections[section].fields.map(([key]) => key);
    const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      keys.join(","),
      ...records.map((r) => keys.map((k) => quote(r[k])).join(",")),
    ].join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `startupiq-${section}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const visible = records.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bw-app" style={{ "--bw-accent": profile.accentColor }}>
      <aside className="bw-sidebar">
        <button className="bw-brand" onClick={() => navigate("dashboard")}>
          <span className="bw-logo">S.</span>
          <span><strong>StartupIQ</strong><small>SMART WORKSPACE</small></span>
        </button>

        <button className="bw-primary bw-full" onClick={() => navigate("sale")}>
          ＋ Record Sale
        </button>

        <nav>
          <button onClick={() => navigate("dashboard")}>⌂ &nbsp; Dashboard</button>
          <div className="bw-group">BUSINESS</div>
          {Object.entries(sections).filter(([key]) =>
            ["product", "material", "sale", "expense", "customer"].includes(key)
          ).map(([key, item]) => (
            <button
              className={section === key ? "active" : ""}
              key={key}
              onClick={() => navigate(key)}
            >
              ◇ &nbsp; {item.title}
            </button>
          ))}
          <div className="bw-group">INSIGHTS</div>
          <button onClick={() => navigate("insights")}>⌁ &nbsp; Growth Insights</button>
          <button onClick={() => navigate("experiment")}>↗ &nbsp; Growth Experiments</button>
          <div className="bw-group">WORKSPACE</div>
          <button onClick={() => navigate("settings")}>⚙ &nbsp; Customise workspace</button>
          {onBack && <button onClick={onBack}>← &nbsp; StartupIQ Guide</button>}
        </nav>
      </aside>

      <main className="bw-main">
        <header className="bw-topbar">
          <strong>{profile.businessName || "My Business"}</strong>
          <button className="bw-secondary" onClick={refresh}>↻ Refresh</button>
        </header>

        <div className="bw-content">
          {error && <p className="bw-error">{error}</p>}
          {message && <p className="bw-success">{message}</p>}
          {busy && <p className="bw-muted">Working…</p>}

          {section === "settings" && (
            <section className="bw-panel">
              <h1>Set up your space</h1>
              <p>Personalise your workspace for your business.</p>
              <form className="bw-form" onSubmit={saveProfile}>
                <label>Business name
                  <input required value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} />
                </label>
                <label>Business type
                  <select value={profile.businessType} onChange={(e) => setProfile({ ...profile, businessType: e.target.value })}>
                    {["Startup founder", "Small or medium enterprise (SME)", "Home bakery", "Jewellery business", "Tailoring / boutique", "Nail artist / beauty business", "Retail shop", "Freelancer / service business", "Other business"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <label>Business stage
                  <select value={profile.businessStage} onChange={(e) => setProfile({ ...profile, businessStage: e.target.value })}>
                    {["Just starting", "Planning to launch", "Already operating", "Growing my business", "Established business"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <label>Workspace template
                  <select value={profile.templateName} onChange={(e) => setProfile({ ...profile, templateName: e.target.value })}>
                    {["Classic", "Product business", "Food & bakery", "Beauty & services", "Retail & inventory", "Startup founder"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
                <label>Accent colour
                  <input type="color" value={profile.accentColor} onChange={(e) => setProfile({ ...profile, accentColor: e.target.value })} />
                </label>
                <label>Business description
                  <textarea value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
                </label>
                <button className="bw-primary" disabled={busy}>Save workspace</button>
              </form>
            </section>
          )}

          {(section === "dashboard" || section === "insights") && (
            <>
              <div className="bw-heading">
                <div className="bw-group">YOUR BUSINESS, YOUR WAY</div>
                <h1>{section === "dashboard" ? "Your business, at a glance." : "Growth Insights"}</h1>
                <p>Track your operations and make better decisions using your recorded data.</p>
                <button className="bw-primary" onClick={() => navigate("settings")}>Customise workspace ↗</button>
              </div>

              <div className="bw-kpis">
                <Kpi label="Revenue" value={money(insights?.totals.revenue)} />
                <Kpi label="Gross profit" value={money(insights?.totals.grossProfit)} />
                <Kpi label="Estimated net profit" value={money(insights?.totals.netProfit)} />
                <Kpi label="Net margin" value={`${insights?.totals.netMarginPercent || 0}%`} />
                <Kpi label="Expenses" value={money(insights?.totals.expenses)} />
                <Kpi label="Average order value" value={money(insights?.totals.averageOrderValue)} />
              </div>

              <section className="bw-panel">
                <h2>Suggested next actions</h2>
                {(insights?.insights || []).map((item, i) => (
                  <article className="bw-insight" key={i}>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </article>
                ))}
                <p className="bw-muted">{insights?.disclaimer}</p>
              </section>
            </>
          )}

          {sections[section] && (
            <>
              <div className="bw-heading bw-row">
                <div>
                  <div className="bw-group">BUSINESS MANAGEMENT</div>
                  <h1>{sections[section].title}</h1>
                  <p>{records.length} records</p>
                </div>
                <div className="bw-actions">
                  <button className="bw-secondary" onClick={exportCsv}>↓ Export CSV</button>
                  <label className="bw-secondary bw-upload">↑ Import CSV<input type="file" accept=".csv,text/csv" onChange={importCsv} /></label>
                  <button className="bw-primary" onClick={addRecord}>＋ Add record</button>
                </div>
              </div>

              <input className="bw-search" placeholder="Search records…" value={search} onChange={(e) => setSearch(e.target.value)} />

              {Object.keys(form).length > 0 && (
                <section className="bw-panel">
                  <h2>{editing ? "Edit record" : "Add record"}</h2>
                  <form className="bw-form" onSubmit={saveRecord}>
                    {sections[section].fields.map(([key, label]) => (
                      <label key={key}>{label}
                        <input
                          type={["price", "cost", "stock", "lowStockAt", "quantity", "unitCost", "unitPrice", "total", "amount", "totalDue", "target"].includes(key) ? "number" : key === "date" ? "date" : "text"}
                          min="0"
                          step="any"
                          required={["name", "description", "price", "cost", "quantity", "unitPrice", "amount", "date"].includes(key)}
                          value={form[key] ?? ""}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        />
                      </label>
                    ))}
                    <div className="bw-actions">
                      <button type="button" className="bw-secondary" onClick={() => { setForm({}); setEditing(null); }}>Cancel</button>
                      <button className="bw-primary" disabled={busy}>{editing ? "Update record" : "Save record"}</button>
                    </div>
                  </form>
                </section>
              )}

              <section className="bw-panel bw-table-panel">
                {visible.length === 0 ? <div className="bw-empty"><h2>No records found</h2><p>Add your first record or import a CSV file.</p></div> : (
                  <div className="bw-table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Category / Details</th><th>Amount / Value</th><th>Actions</th></tr></thead>
                      <tbody>
                        {visible.map((row) => (
                          <tr key={row.id}>
                            <td>{row.name || row.description || row.customer || row.title}</td>
                            <td>{row.category || row.product || row.status || row.email || "—"}</td>
                            <td>{money(row.total ?? row.amount ?? row.price ?? row.unitCost ?? row.totalDue ?? 0)}</td>
                            <td className="bw-actions">
                              <button className="bw-secondary" onClick={() => editRecord(row)}>Edit</button>
                              <button className="bw-secondary" onClick={() => deleteRecord(row.id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <p className="bw-muted">CSV import creates new records. Check the headers before importing and avoid importing the same file twice.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value }) {
  return <div className="bw-kpi"><span>{label}</span><strong>{value ?? "—"}</strong></div>;
}
