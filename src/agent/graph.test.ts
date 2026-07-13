import { describe, it, expect } from "vitest";
import { routeAfterCompleteness } from "./graph.js";

const completeInvoice = {
  id: "inv-1",
  contact_id: "c-1",
  invoice_date: "2026-06-01",
  total_price_excl_tax: 10000,
  total_price_incl_tax: 12100,
  tax: 2100,
  currency: "EUR",
  state: "draft",
};

const state = (overrides: Record<string, unknown> = {}) =>
  ({ invoice: { ...completeInvoice }, ...overrides }) as any;

describe("routeAfterCompleteness", () => {
  it("routes a complete invoice straight to contact resolution", () => {
    expect(routeAfterCompleteness(state())).toBe("resolveContact");
  });

  it("routes to alert on error", () => {
    expect(routeAfterCompleteness(state({ error: "boom" }))).toBe("alert");
  });

  it("routes to alert without an invoice", () => {
    expect(routeAfterCompleteness(state({ invoice: undefined }))).toBe("alert");
  });

  it("scans the PDF when the contact is missing", () => {
    const s = state();
    s.invoice.contact_id = undefined;
    s.invoice.contact = undefined;
    expect(routeAfterCompleteness(s)).toBe("scanInvoicePdf");
  });

  it("scans the PDF when amounts are missing or zero", () => {
    const s = state();
    s.invoice.total_price_incl_tax = 0;
    expect(routeAfterCompleteness(s)).toBe("scanInvoicePdf");
  });

  it("scans the PDF when the invoice date is missing", () => {
    const s = state();
    s.invoice.invoice_date = undefined;
    expect(routeAfterCompleteness(s)).toBe("scanInvoicePdf");
  });

  it("treats a legitimate 0 tax (reverse charge) as complete", () => {
    const s = state();
    s.invoice.tax = 0;
    expect(routeAfterCompleteness(s)).toBe("resolveContact");
  });
});
