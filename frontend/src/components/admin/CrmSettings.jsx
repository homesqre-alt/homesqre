import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function CrmSettings() {
  return (
    <div className="space-y-10" data-testid="crm-settings">
      <header>
        <h2 className="font-display text-2xl text-[#06402B]">CRM Customization</h2>
        <p className="text-xs text-[#4A5D54]">Statuses and Sources used across the lead pipeline. Auto-assignment rules are bound to status.</p>
      </header>
      <SettingsList kind="statuses" supportsRole />
      <SettingsList kind="sources" />
    </div>
  );
}

function SettingsList({ kind, supportsRole }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/crm/${kind}`); setItems(data); }
    catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const payload = { name: newName.trim(), sort_order: items.length };
      if (supportsRole) payload.assign_to_role = newRole || null;
      await api.post(`/crm/${kind}`, payload);
      setNewName(""); setNewRole("");
      toast.success("Added");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const updateRole = async (name, role) => {
    try {
      await api.put(`/crm/${kind}/${encodeURIComponent(name)}`, { assign_to_role: role || null });
      toast.success("Updated");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const remove = async (name) => {
    if (!confirm(`Delete ${kind.slice(0, -1)} "${name}"?`)) return;
    try {
      await api.delete(`/crm/${kind}/${encodeURIComponent(name)}`);
      toast.success("Deleted");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <section data-testid={`crm-settings-${kind}`}>
      <h3 className="font-display text-lg text-[#06402B] mb-3 capitalize">{kind}</h3>
      <div className="border border-[#E8E4D9]">
        <table className="w-full text-sm">
          <thead className="bg-[#06402B] text-white text-xs uppercase tracking-widest">
            <tr>
              <th className="p-3 text-left">Name</th>
              {supportsRole && <th className="p-3 text-left">Auto-assign role</th>}
              <th className="p-3 text-left w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={supportsRole ? 3 : 2} className="p-4 text-center text-[#4A5D54]">Loading…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={supportsRole ? 3 : 2} className="p-4 text-center text-[#4A5D54]">None defined.</td></tr>
            )}
            {items.map(it => (
              <tr key={it.name} className="border-t border-[#E8E4D9]">
                <td className="p-3 font-semibold text-[#06402B]">{it.name}</td>
                {supportsRole && (
                  <td className="p-3">
                    <select
                      data-testid={`role-select-${it.name}`}
                      value={it.assign_to_role || ""}
                      onChange={(e) => updateRole(it.name, e.target.value)}
                      className="p-1.5 text-sm border border-[#E8E4D9] bg-white"
                    >
                      <option value="">— none —</option>
                      <option value="sales">sales</option>
                      <option value="designer">designer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                )}
                <td className="p-3">
                  <button onClick={() => remove(it.name)} className="text-xs uppercase tracking-widest text-red-700 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={create} className="mt-3 flex flex-wrap gap-2">
        <input
          data-testid={`new-${kind}-name`}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={`New ${kind.slice(0, -1)} name`}
          className="flex-1 min-w-[200px] p-2 text-sm border border-[#E8E4D9] bg-white"
        />
        {supportsRole && (
          <select
            data-testid={`new-${kind}-role`}
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            className="p-2 text-sm border border-[#E8E4D9] bg-white"
          >
            <option value="">No auto-assign</option>
            <option value="sales">→ sales (round-robin)</option>
            <option value="designer">→ designer (round-robin)</option>
            <option value="admin">→ admin</option>
          </select>
        )}
        <button type="submit" data-testid={`new-${kind}-submit`}
                className="px-4 py-2 text-xs uppercase tracking-widest bg-[#06402B] text-white">Add</button>
      </form>
    </section>
  );
}
