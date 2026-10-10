import { expect, it } from "vitest";
import { parseChangeOrderCsv } from "../importChangeOrderCsv";

it.each(["CO #", "CO No.", "Change Order #", "CCO #", "#"])("recognizes the documented %s reference header", header => {
  const parsed = parseChangeOrderCsv(`${header},Title,Amount,Status\n17,Added embeds,1200,Draft`);
  expect(parsed.cos).toHaveLength(1);
  expect(parsed.cos[0]).toMatchObject({ co_number: "17", co_amount: 1200, status: "Draft" });
});
