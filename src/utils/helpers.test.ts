import { describe, expect, it } from "vitest";
import { buildCsv, csvField } from "./exportFile";
import { getDisplayTitle } from "./titles";

describe("CSV building", () => {
  it("quote-wraps fields containing commas, quotes or newlines", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField(null)).toBe("");
  });

  it("builds a BOM-prefixed CSV with a header row", () => {
    const csv = buildCsv(["name", "count"], [["کتاب", 3], ["x,y", 4]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\n");
    expect(lines[0]).toBe("name,count");
    expect(lines[1]).toBe("کتاب,3");
    expect(lines[2]).toBe('"x,y",4');
  });
});

describe("display title preference", () => {
  const item = { title: "Data Structures", arabic_title: "بنى المعلومات", subtitle: "An Introduction" };

  it("prefers the catalog title in original mode", () => {
    expect(getDisplayTitle(item, "original")).toEqual({ main: "Data Structures", sub: "بنى المعلومات" });
  });

  it("leads with the arabic title when requested", () => {
    expect(getDisplayTitle(item, "arabic")).toEqual({ main: "بنى المعلومات", sub: "Data Structures" });
  });

  it("falls back to the subtitle when titles match", () => {
    const same = { title: "Fables", arabic_title: "Fables" };
    expect(getDisplayTitle(same, "arabic")).toEqual({ main: "Fables", sub: undefined });
  });
});
