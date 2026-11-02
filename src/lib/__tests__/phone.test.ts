import { describe, expect, it } from "vitest";
import {
  formatPhoneForDisplay,
  isValidPhone,
  normalizePhone,
  toDialablePhone,
  splitPhoneNumbers,
  parseDialablePhone,
  getPhoneOptions,
} from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalizes Bangladesh local numbers", () => {
    expect(normalizePhone("01712345678")).toBe("+8801712345678");
    expect(normalizePhone("017-1234 5678")).toBe("+8801712345678");
  });
  it("accepts country-code forms", () => {
    expect(normalizePhone("8801712345678")).toBe("+8801712345678");
    expect(normalizePhone("+880 1712-345678")).toBe("+8801712345678");
  });
  it("accepts other international numbers", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects invalid input", () => {
    for (const bad of [
      "",
      "   ",
      "abc",
      "12345",
      "0171234567",
      "01012345678",
      "+8801012345678",
      "999 / +880 2 8631",
      "+0123456789",
    ]) {
      expect(isValidPhone(bad), bad).toBe(false);
    }
  });
  it("formats for display", () => {
    expect(formatPhoneForDisplay("01712345678")).toBe("+880 1712-345678");
    expect(formatPhoneForDisplay("")).toBe("");
    expect(formatPhoneForDisplay("garbage")).toBe("garbage");
  });

  it("produces clean dialable strings for tel: links (MAP-1)", () => {
    expect(toDialablePhone("999 / +880 2 8631 822")).toBe("999");
    expect(toDialablePhone("999, +880 2 8631 822")).toBe("999");
    expect(toDialablePhone("+880 2 8631 822")).toBe("+88028631822");
    expect(toDialablePhone("+880 1711 000 121")).toBe("+8801711000121");
    expect(toDialablePhone("01711000121")).toBe("01711000121");
    expect(toDialablePhone("102")).toBe("102");
    expect(toDialablePhone("1090")).toBe("1090");
    expect(toDialablePhone("16163")).toBe("16163");
    expect(toDialablePhone("")).toBe("");
    expect(toDialablePhone(null)).toBe("");
    expect(toDialablePhone("N/A")).toBe("");
  });

  it("splits composite phone numbers cleanly without mangling digits (MAP-1)", () => {
    expect(splitPhoneNumbers("999 / +880 2 8631 822")).toEqual(["999", "+880 2 8631 822"]);
    expect(splitPhoneNumbers("999, +880 2 8631 822")).toEqual(["999", "+880 2 8631 822"]);
    expect(splitPhoneNumbers("01711000208; 01711000209")).toEqual(["01711000208", "01711000209"]);
    expect(splitPhoneNumbers("102 or +880 2 9555 555")).toEqual(["102", "+880 2 9555 555"]);
    expect(splitPhoneNumbers("")).toEqual([]);
    expect(splitPhoneNumbers("N/A")).toEqual([]);
  });

  it("provides structured phone options for multiple numbers (MAP-1)", () => {
    const options = getPhoneOptions("999 / +880 2 8631 822");
    expect(options).toEqual([
      { display: "999", dialable: "999" },
      { display: "+880 2 8631 822", dialable: "+88028631822" },
    ]);
  });
});
