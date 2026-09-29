const TABS = [
  { id: "owner", label: "Owner" },
  { id: "guardian", label: "Guardian" },
  { id: "recovery", label: "Recovery" },
  { id: "history", label: "History" },
];

export default function TabNav({ tab, setTab, recoveryActive }) {
  return (
    <nav className="tabs" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`tab ${tab === t.id ? "active" : ""}`}
          onClick={() => setTab(t.id)}
        >
          {t.label}
          {t.id === "recovery" && recoveryActive && <span className="pulse" aria-label="recovery in progress" />}
        </button>
      ))}
    </nav>
  );
}
