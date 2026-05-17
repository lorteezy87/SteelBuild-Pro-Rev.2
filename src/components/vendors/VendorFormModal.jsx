import React, { useState, useEffect } from "react";
import PhoenixModal, { btnPrimary, btnSecondary, inputStyle, FormField } from "@/components/shared/PhoenixModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["Fabricator", "Supplier", "Subcontractor", "Material Supplier", "Equipment Rental", "Service Provider", "Testing Lab", "Other"];

const empty = {
  company_name: "", vendor_type: "Supplier", contact_person: "", title: "",
  phone: "", email: "", address: "", city: "", state: "", zip: "",
  website: "", certifications: "", certifications_expiry: "", insurance_provider: "",
  insurance_expiry: "", years_in_business: "", status: "Active",
  pricing_tier: "Standard", payment_terms: "Net 30", is_preferred: false,
};

export default function VendorFormModal({ open, onClose, onSave, vendor }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (vendor) {
      setForm({ ...empty, ...vendor, years_in_business: vendor.years_in_business ?? "" });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [vendor, open]);

  const validate = () => {
    const e = {};
    if (!form.company_name?.trim()) e.company_name = "Required";
    if (!form.vendor_type) e.vendor_type = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const data = {
      ...form,
      years_in_business: form.years_in_business !== "" ? Number(form.years_in_business) : null,
    };
    onSave(data);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  return (
    <PhoenixModal
      open={open}
      onClose={onClose}
      title={vendor ? `Edit ${vendor.company_name || "Vendor"}` : "New Vendor"}
      footer={<>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={handleSave}>{vendor ? "Update" : "Create"}</button>
      </>}
    >
      <div style={grid}>
        <FormField label="Company Name *" error={errors.company_name}>
          <input style={inputStyle} value={form.company_name} onChange={e => set("company_name", e.target.value)} />
        </FormField>
        <FormField label="Type *" error={errors.vendor_type}>
          <Select value={form.vendor_type} onValueChange={v => set("vendor_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="Contact Person">
          <input style={inputStyle} value={form.contact_person} onChange={e => set("contact_person", e.target.value)} />
        </FormField>
        <FormField label="Title">
          <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g., Sales Manager" />
        </FormField>
        <FormField label="Phone">
          <input type="tel" style={inputStyle} value={form.phone} onChange={e => set("phone", e.target.value)} />
        </FormField>
        <FormField label="Email">
          <input type="email" style={inputStyle} value={form.email} onChange={e => set("email", e.target.value)} />
        </FormField>
        <FormField label="Address" span2>
          <input style={inputStyle} value={form.address} onChange={e => set("address", e.target.value)} />
        </FormField>
        <FormField label="City">
          <input style={inputStyle} value={form.city} onChange={e => set("city", e.target.value)} />
        </FormField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <FormField label="State">
            <input style={inputStyle} value={form.state} onChange={e => set("state", e.target.value)} maxLength={2} />
          </FormField>
          <FormField label="ZIP">
            <input style={inputStyle} value={form.zip} onChange={e => set("zip", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Website">
          <input type="url" style={inputStyle} value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://..." />
        </FormField>
        <FormField label="Years in Business">
          <input type="number" style={inputStyle} value={form.years_in_business} onChange={e => set("years_in_business", e.target.value)} min="0" />
        </FormField>
        <FormField label="Certifications">
          <input style={inputStyle} value={form.certifications} onChange={e => set("certifications", e.target.value)} placeholder="AWS, API, ISO 9001" />
        </FormField>
        <FormField label="Cert. Expiry">
          <input type="date" style={inputStyle} value={form.certifications_expiry || ""} onChange={e => set("certifications_expiry", e.target.value)} />
        </FormField>
        <FormField label="Insurance Provider">
          <input style={inputStyle} value={form.insurance_provider} onChange={e => set("insurance_provider", e.target.value)} />
        </FormField>
        <FormField label="Insurance Expiry">
          <input type="date" style={inputStyle} value={form.insurance_expiry || ""} onChange={e => set("insurance_expiry", e.target.value)} />
        </FormField>
        <FormField label="Payment Terms">
          <input style={inputStyle} value={form.payment_terms} onChange={e => set("payment_terms", e.target.value)} placeholder="Net 30" />
        </FormField>
        <FormField label="Pricing Tier">
          <Select value={form.pricing_tier} onValueChange={v => set("pricing_tier", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Premium">Premium</SelectItem>
              <SelectItem value="Standard">Standard</SelectItem>
              <SelectItem value="Budget">Budget</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Active", "Inactive", "Probation", "Suspended"].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", cursor: "pointer", marginTop: 16 }}>
            <input type="checkbox" checked={form.is_preferred} onChange={e => set("is_preferred", e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
            Preferred Vendor
          </label>
        </FormField>
      </div>
    </PhoenixModal>
  );
}
