import { describe, expect, it } from "vitest";
import {
  formatAssignmentDueDate,
  getAssignmentStageLabel,
  getUnderstandingStatusLabel,
} from "./list-view-model";

describe("assignment list presentation", () => {
  it("does not fabricate a missing due date", () => {
    expect(formatAssignmentDueDate(null)).toBe("No due date added");
  });

  it("formats a date without local timezone drift", () => {
    expect(formatAssignmentDueDate("2026-09-30")).toBe("Sep 30, 2026");
  });

  it("uses stable English stage and analysis labels", () => {
    expect(getAssignmentStageLabel("setup")).toBe("Set up");
    expect(getUnderstandingStatusLabel("not_started")).toBe("Not analyzed");
    expect(getUnderstandingStatusLabel("processing")).toBe("Analyzing");
    expect(getUnderstandingStatusLabel("ready")).toBe("Ready");
    expect(getUnderstandingStatusLabel("failed")).toBe("Needs retry");
  });
});
