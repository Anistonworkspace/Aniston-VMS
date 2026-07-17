import { vi, afterEach } from "vitest";

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
