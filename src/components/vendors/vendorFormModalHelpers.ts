/** Pure empty form + type catalog for VendorFormModal. */

export const VENDOR_TYPES = [
  "Fabricator",
  "Supplier",
  "Subcontractor",
  "Material Supplier",
  "Equipment Rental",
  "Service Provider",
  "Testing Lab",
  "Other",
] as const;

export const EMPTY_VENDOR_FORM = {
  company_name: "",
  vendor_type: "Supplier",
  contact_person: "",
  title: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  website: "",
  certifications: "",
  certifications_expiry: "",
  insurance_provider: "",
  insurance_expiry: "",
  years_in_business: "",
  status: "Active",
  pricing_tier: "Standard",
  payment_terms: "Net 30",
  is_preferred: false,
};
