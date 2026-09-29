import { DEMO_ROLES } from "../utils/roles";

/** Address field with one-click fills for the Hardhat demo accounts (saves time in a live demo). */
export default function AddressInput({ id, label, value, onChange, roles, fills = [] }) {
  const options = DEMO_ROLES.filter((r) => fills.includes(r.key) && roles?.[r.key]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="mono"
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      {options.length > 0 && (
        <div className="fills">
          {options.map((r) => (
            <button type="button" key={r.key} className="chip" onClick={() => onChange(roles[r.key])}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
