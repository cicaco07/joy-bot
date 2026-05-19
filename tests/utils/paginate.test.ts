import { describe, expect, it } from "vitest";

import { paginate } from "../../src/utils/paginate.js";

describe("paginate", () => {
  it("returns canonical empty pagination", () => {
    expect(paginate([], 3, 10)).toEqual({
      slice: [],
      page: 1,
      totalPages: 1,
      total: 0,
    });
  });

  it("returns a single page", () => {
    expect(paginate([1, 2, 3], 1, 10)).toEqual({
      slice: [1, 2, 3],
      page: 1,
      totalPages: 1,
      total: 3,
    });
  });

  it("handles exact page boundary", () => {
    expect(paginate([1, 2, 3, 4], 2, 2)).toEqual({
      slice: [3, 4],
      page: 2,
      totalPages: 2,
      total: 4,
    });
  });

  it("returns a partial last page", () => {
    expect(paginate([1, 2, 3, 4, 5], 3, 2)).toEqual({
      slice: [5],
      page: 3,
      totalPages: 3,
      total: 5,
    });
  });

  it("clamps page too high", () => {
    expect(paginate([1, 2, 3, 4, 5], 99, 2)).toEqual({
      slice: [5],
      page: 3,
      totalPages: 3,
      total: 5,
    });
  });

  it("clamps page below one", () => {
    expect(paginate([1, 2, 3, 4, 5], 0, 2)).toEqual({
      slice: [1, 2],
      page: 1,
      totalPages: 3,
      total: 5,
    });
  });

  it("normalizes invalid pageSize to one", () => {
    expect(paginate([1, 2], 1, 0)).toEqual({
      slice: [1],
      page: 1,
      totalPages: 2,
      total: 2,
    });
  });
});
