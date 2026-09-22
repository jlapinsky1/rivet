function sameName(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function propertyAddress(company, item) {
  const props = company.properties || [];
  const prop = props.find(p => sameName(p.name, item.propertyName)) || null;
  const street = prop?.address;
  if (!street) return null;
  return item.unitLabel ? `${street} · ${item.unitLabel}` : street;
}

/** Fill a blank phone, email, or street address from the customer or company record. */
export function attachCustomerContact(item, customers, companies) {
  const person = (customers || []).find(c => sameName(c.name, item.customerName));
  const company = (companies || []).find(c =>
    sameName(c.name, item.companyName) || sameName(c.name, item.customerName)
  );

  let phone = item.phone || null;
  let email = item.email || null;
  let address = item.address || null;

  if (person) {
    phone = phone || person.phone || null;
    email = email || person.email || null;
    address = address || person.address || null;
  } else if (company) {
    phone = phone || company.phone || null;
    email = email || company.email || null;
    address = address || propertyAddress(company, item);
  }

  return { ...item, phone, email, address };
}
