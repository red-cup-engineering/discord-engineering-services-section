// Extracted to its own leaf so the reporting child no longer depends on the
// settlement root (cycle break, 2026-08-11). This shim preserves the old
// import path for settlement-internal callers and the exported subpath.
export * from "@red-cup-engineering/turntide-witness-journal-binding-service";
