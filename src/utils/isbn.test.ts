import { describe, expect, it } from "vitest";
import {
  cleanPhone,
  formatIsbn,
  generateRandomMemberNumber,
  isValidIsbn,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
  toIsbn10,
  toIsbn13,
} from "./isbn";

describe("ISBN helpers", () => {
  it("normalizes separators and casing", () => {
    expect(normalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(normalizeIsbn("isbn: 0-8044-2957x")).toBe("080442957X");
  });

  it("accepts checksum-valid ISBN-13 values and rejects broken ones", () => {
    expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
    expect(isValidIsbn("9780306406157")).toBe(true);
    // one digit flipped → checksum breaks
    expect(isValidIsbn("9780306406158")).toBe(false);
    // non-Bookland prefix
    expect(isValidIsbn13("9770306406157")).toBe(false);
  });

  it("accepts checksum-valid ISBN-10 values, X check digit included", () => {
    expect(isValidIsbn10("0-8044-2957-X")).toBe(true);
    expect(isValidIsbn("0306406152")).toBe(true);
    expect(isValidIsbn("0306406151")).toBe(false);
    expect(isValidIsbn("123456789")).toBe(false);
  });

  it("converts between ISBN-10 and ISBN-13", () => {
    expect(toIsbn13("0-306-40615-2")).toBe("9780306406157");
    expect(toIsbn10("9780306406157")).toBe("0306406152");
    expect(toIsbn10("9791234567896")).toBeNull();
  });

  it("hyphenates ISBN-10 and ISBN-13 for display and passes junk through", () => {
    expect(formatIsbn("080442957X")).toBe("0-804-42957-X");
    expect(formatIsbn("9780306406157")).toBe("978-0-306-40615-7");
    expect(formatIsbn("9788175257665")).toBe("978-81-7525-766-5");
    expect(formatIsbn("9780306406157")).toBe(formatIsbn("978-0-306-40615-7"));
    expect(formatIsbn("not-an-isbn")).toBe("not-an-isbn");
    expect(formatIsbn("")).toBe("");
    expect(formatIsbn(null)).toBe("");
  });

  it("cleans phone numbers but keeps a leading +", () => {
    expect(cleanPhone("+98 912 345 6789")).toBe("+989123456789");
    expect(cleanPhone("021-5544")).toBe("0215544");
  });

  it("generates n-digit member numbers without leading zeros", () => {
    for (let i = 0; i < 20; i++) {
      const value = generateRandomMemberNumber(6);
      expect(value).toMatch(/^\d{6}$/);
      expect(value[0]).not.toBe("0");
    }
  });
});
