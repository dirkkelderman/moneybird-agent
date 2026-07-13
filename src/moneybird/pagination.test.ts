import "../test/setup.js";
import { describe, it, expect } from "vitest";
import { MoneybirdMCPClient } from "./mcpClient.js";

const makeItems = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));

describe("listAllPages", () => {
  const client = new MoneybirdMCPClient();

  it("collects items across multiple pages until a short page", async () => {
    const result = await client.listAllPages(async (page) => {
      const p = Number(page);
      if (p === 1) return makeItems(0, 100);
      if (p === 2) return makeItems(100, 100);
      return makeItems(200, 50);
    });
    expect(result.items).toHaveLength(250);
    expect(result.truncated).toBe(false);
  });

  it("stops cleanly when a following page is empty (exact page boundary)", async () => {
    const result = await client.listAllPages(async (page) =>
      Number(page) === 1 ? makeItems(0, 100) : []
    );
    expect(result.items).toHaveLength(100);
    expect(result.truncated).toBe(false);
  });

  it("detects a server that ignores the page parameter", async () => {
    let calls = 0;
    const result = await client.listAllPages(async () => {
      calls++;
      return makeItems(0, 100); // Same first item every time
    });
    expect(result.items).toHaveLength(100); // No duplicated data
    expect(result.truncated).toBe(false);
    expect(calls).toBe(2); // Stopped right after detecting the repeat
  });

  it("reports truncation when the page cap is hit", async () => {
    const result = await client.listAllPages(
      async (page) => makeItems(Number(page) * 1000, 100),
      { maxPages: 3 }
    );
    expect(result.items).toHaveLength(300);
    expect(result.truncated).toBe(true);
  });

  it("returns empty without truncation for an empty first page", async () => {
    const result = await client.listAllPages(async () => []);
    expect(result.items).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it("clamps per_page to Moneybird's cap of 100", async () => {
    let requestedPerPage: string | undefined;
    await client.listAllPages(
      async (_page, perPage) => {
        requestedPerPage = perPage;
        return [];
      },
      { perPage: 200 }
    );
    expect(requestedPerPage).toBe("100");
  });
});
