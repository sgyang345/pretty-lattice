import { describe, expect, test } from "bun:test";

import { formatStructureNumber } from "../src/model/structurePrecision";

describe("structure number precision", () => {
  test("keeps up to sixteen decimal places without exposing binary float noise", () => {
    expect(formatStructureNumber(1 / 3)).toBe("0.3333333333333333");
    expect(formatStructureNumber(0.12345678901234567)).toBe("0.1234567890123457");
    expect(formatStructureNumber(2.2999999999999998)).toBe("2.3");
    expect(formatStructureNumber(0.0000000000000001)).toBe("0.0000000000000001");
    expect(formatStructureNumber(-0)).toBe("0");
  });
});
