import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function CrmSettings() {
  return (
    <div className="space-y-10" data-testid="crm-settings">
      <header>
        <h2 className="font-display text-2xl text-[#0C1D42]">CRM Customization</h2>
        <p className="text-xs text-[#333333]">Statuses and Sources used across the lead pipeline. Auto-assignment rules are bound to status.</p>
      </header>
      <SettingsList kind="statuses" supportsRole />
      <SettingsList kind="sources" />
      <PackageManagement />
    </div>
  );
}

function PackageManagement() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/packages`); setPackages(data); }
    catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.put(`/admin/packages`, { packages });
      toast.success("Packages updated successfully");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const addGroup = () => {
    setPackages([...packages, { group: "New Group", property_type: "new_type", options: [] }]);
  };

  const removeGroup = (idx) => {
    if (!confirm("Remove this group?")) return;
    const newPkgs = [...packages];
    newPkgs.splice(idx, 1);
    setPackages(newPkgs);
  };

  const updateGroup = (idx, field, value) => {
    const newPkgs = [...packages];
    newPkgs[idx] = { ...newPkgs[idx], [field]: value };
    setPackages(newPkgs);
  };

  const addOption = (groupIdx) => {
    const newPkgs = [...packages];
    newPkgs[groupIdx] = { ...newPkgs[groupIdx], options: [...newPkgs[groupIdx].options, { value: "", label: "", price: 0, blurb: "" }] };
    setPackages(newPkgs);
  };

  const updateOption = (groupIdx, optIdx, field, value) => {
    const newPkgs = [...packages];
    const newOptions = [...newPkgs[groupIdx].options];
    newOptions[optIdx] = { ...newOptions[optIdx], [field]: field === 'price' ? Number(value) : value };
    newPkgs[groupIdx] = { ...newPkgs[groupIdx], options: newOptions };
    setPackages(newPkgs);
  };

  const removeOption = (groupIdx, optIdx) => {
    const newPkgs = [...packages];
    const newOptions = [...newPkgs[groupIdx].options];
    newOptions.splice(optIdx, 1);
    newPkgs[groupIdx] = { ...newPkgs[groupIdx], options: newOptions };
    setPackages(newPkgs);
  };

  return (
    <section data-testid="package-management" className="mt-10 border-t border-[#EDE5DB] pt-10">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-display text-2xl text-[#0C1D42]">Property Packages Catalogue</h3>
          <p className="text-xs text-[#333333]">Manage the dynamic package catalogue shown to customers in the onboarding wizard.</p>
        </div>
        <button onClick={save} className="bg-[#DA9E3E] text-white px-6 py-2 uppercase tracking-widest text-xs font-bold hover:bg-[#C88C2F]">Save Changes</button>
      </div>

      {loading ? <p className="text-sm text-[#333333]">Loading packages...</p> : (
        <div className="space-y-6">
          {packages.map((pkg, gIdx) => (
            <div key={gIdx} className="border border-[#EDE5DB] p-4 bg-white">
              <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
                <div className="flex gap-2 w-full sm:w-auto">
                  <input value={pkg.group} onChange={e => updateGroup(gIdx, 'group', e.target.value)} placeholder="Group Name (e.g. Apartment)" className="border p-2 text-sm font-bold text-[#0C1D42] w-48 focus:border-[#0C1D42] outline-none" />
                  <input value={pkg.property_type} onChange={e => updateGroup(gIdx, 'property_type', e.target.value)} placeholder="Type ID (e.g. apartment)" className="border p-2 text-sm w-48 focus:border-[#0C1D42] outline-none" />
                </div>
                <button onClick={() => removeGroup(gIdx)} className="text-red-600 text-xs uppercase tracking-widest hover:underline whitespace-nowrap">Remove Group</button>
              </div>
              <div className="space-y-2 overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-[#F5EDE8] text-[10px] uppercase tracking-widest text-[#0C1D42]">
                    <tr>
                      <th className="p-2 text-left w-24">Value ID</th>
                      <th className="p-2 text-left w-32">Label</th>
                      <th className="p-2 text-left w-32">Price (₹)</th>
                      <th className="p-2 text-left">Description</th>
                      <th className="p-2 text-center w-12">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkg.options.map((opt, oIdx) => (
                      <tr key={oIdx} className="border-t border-[#EDE5DB]">
                        <td className="p-1"><input value={opt.value} onChange={e => updateOption(gIdx, oIdx, 'value', e.target.value)} className="w-full border p-1 text-xs focus:border-[#0C1D42] outline-none" /></td>
                        <td className="p-1"><input value={opt.label} onChange={e => updateOption(gIdx, oIdx, 'label', e.target.value)} className="w-full border p-1 text-xs focus:border-[#0C1D42] outline-none" /></td>
                        <td className="p-1"><input type="number" value={opt.price} onChange={e => updateOption(gIdx, oIdx, 'price', e.target.value)} className="w-full border p-1 text-xs focus:border-[#0C1D42] outline-none" /></td>
                        <td className="p-1"><input value={opt.blurb} onChange={e => updateOption(gIdx, oIdx, 'blurb', e.target.value)} className="w-full border p-1 text-xs focus:border-[#0C1D42] outline-none" /></td>
                        <td className="p-1 text-center"><button onClick={() => removeOption(gIdx, oIdx)} className="text-red-600 hover:text-red-800 font-bold">&times;</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => addOption(gIdx)} className="text-[#DA9E3E] text-xs uppercase tracking-widest font-bold hover:underline mt-2 inline-block">+ Add Option</button>
              </div>
            </div>
          ))}
          <button onClick={addGroup} className="border-2 border-[#0C1D42] text-[#0C1D42] px-6 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#F5EDE8] transition">Add New Property Group</button>
        </div>
      )}
    </section>
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
      <h3 className="font-display text-lg text-[#0C1D42] mb-3 capitalize">{kind}</h3>
      <div className="border border-[#EDE5DB]">
        <table className="w-full text-sm">
          <thead className="bg-[#0C1D42] text-white text-xs uppercase tracking-widest">
            <tr>
              <th className="p-3 text-left">Name</th>
              {supportsRole && <th className="p-3 text-left">Auto-assign role</th>}
              <th className="p-3 text-left w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={supportsRole ? 3 : 2} className="p-4 text-center text-[#333333]">Loading…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={supportsRole ? 3 : 2} className="p-4 text-center text-[#333333]">None defined.</td></tr>
            )}
            {items.map(it => (
              <tr key={it.name} className="border-t border-[#EDE5DB]">
                <td className="p-3 font-semibold text-[#0C1D42]">{it.name}</td>
                {supportsRole && (
                  <td className="p-3">
                    <select
                      data-testid={`role-select-${it.name}`}
                      value={it.assign_to_role || ""}
                      onChange={(e) => updateRole(it.name, e.target.value)}
                      className="p-1.5 text-sm border border-[#EDE5DB] bg-white"
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
          className="flex-1 min-w-[200px] p-2 text-sm border border-[#EDE5DB] bg-white"
        />
        {supportsRole && (
          <select
            data-testid={`new-${kind}-role`}
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            className="p-2 text-sm border border-[#EDE5DB] bg-white"
          >
            <option value="">No auto-assign</option>
            <option value="sales">→ sales</option>
            <option value="designer">→ designer</option>
            <option value="admin">→ admin</option>
          </select>
        )}
        <button type="submit" data-testid={`new-${kind}-submit`}
                className="px-4 py-2 text-xs uppercase tracking-widest bg-[#0C1D42] text-white">Add</button>
      </form>
    </section>
  );
}
