import { describe, expect, it } from "vitest";
import { InvalidPlate, normalisePlate } from "./plate.ts";

describe("normalisePlate", () => {
  it.each([
    ["1234ABC", "1234ABC"],
    ["1234-abc", "1234ABC"],
    ["1234 ABC", "1234ABC"],
    [" 12-34 a-b c- ", "1234ABC"],
    ["az", "AZ"],
    ["09", "09"],
    ["ABCDE-12345", "ABCDE12345"],
  ])("normalises %j to %s", (typed, normalised) => {
    expect(normalisePlate(typed)).toBe(normalised);
  });

  it.each([
    ["an empty plate", ""],
    ["only separators", " - "],
    ["one character", "A"],
    ["one character after normalisation", "1-"],
    ["eleven characters", "ABCDE123456"],
    ["a forbidden character", "12#4"],
    ["a forbidden first character", "#1234"],
    ["a forbidden last character", "1234#"],
    ["a letter outside A-Z", "ÑAB123"],
    ["a non-ASCII lower case letter", "1234ıbc"],
    ["a tab", "1234\tABC"],
    ["a non-breaking space", "1234 ABC"],
    ["an en dash", "1234–ABC"],
  ])("rejects %s", (_case, typed) => {
    expect(() => normalisePlate(typed)).toThrow(InvalidPlate);
  });
});
