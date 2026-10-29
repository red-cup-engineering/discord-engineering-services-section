// Ambient module declarations for @red-cup-engineering packages that ship
// plain untyped `.mjs` (no `types`/`declaration` output). Each declaration
// below is read directly off the installed package's source — not invented —
// and kept to exactly the surface this app imports. If the upstream package
// ever ships its own types, delete the matching block here rather than let
// it shadow the real ones.

// node_modules/@red-cup-engineering/relation-model-notation-typing/src/index.mjs
declare module "@red-cup-engineering/relation-model-notation-typing" {
  // The package's own JSDoc types `Ty`/`Tm` against
  // `@red-cup-engineering/relation-model-notation/types`, which this app
  // does not depend on directly and has no compiled types for either.
  // `Ty`/`Tm` are tagged tuples (`term[0]` dispatch, see `inferTy`); this
  // app already treats RMN terms as `readonly any[]` (see `RmnTerm` in
  // daily-divination-report.mts), so the same honest widening is used here.
  type Ty = readonly unknown[];
  type Tm = readonly unknown[];

  export function tyEqual(left: Ty, right: Ty): boolean;
  export function inferTy(ctx: readonly Ty[], term: Tm): Ty | null;
  export function checkTy(ctx: readonly Ty[], term: Tm, type: Ty): boolean;
  export const hasTy: (ctx: readonly Ty[], term: Tm, type: Ty) => boolean;
  export function termSize(term: Tm): number;
  export function termUses(term: Tm): readonly string[];
  export function isClosed(term: Tm): boolean;
}

// node_modules/@red-cup-engineering/inference-work-lot-service/src/sovereign-provider-interface.mjs
declare module "@red-cup-engineering/inference-work-lot-service/sovereign-provider-interface" {
  export const HIERARCHICAL_CIRCUIT_PROFILE: string;
  export const SOVEREIGN_CIRCUIT_INTERFACE_PROFILE: string;
  export const SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION: string;

  type CircuitBit = Readonly<{ positiveEvidence: boolean; negativeEvidence: boolean }>;
  type CircuitPort = Readonly<{
    name: string;
    direction: "input" | "output";
    mode: "tensor" | "par";
    predicate: string;
    carrier: string;
  }>;
  type CircuitFactor = Readonly<{
    inputs: readonly string[];
    outputs: readonly string[];
    rows: readonly Readonly<{ input: readonly CircuitBit[]; output: readonly CircuitBit[] }>[];
  }>;
  type CircuitLeaf = Readonly<{
    profile: string;
    law: string;
    ports: readonly CircuitPort[];
    instances: readonly never[];
    nets: readonly never[];
    behavior: Readonly<{ factors: readonly CircuitFactor[] }>;
  }>;

  // `card` is validated structurally at runtime (throws `malformed-circuit`
  // on any mismatch) rather than assumed to satisfy a caller-supplied TS
  // shape, so it is typed as `unknown` here to match.
  export function circuitInterfaceFromAgentCard(card: unknown): Readonly<{
    account: string;
    authority: string;
    custody: string;
    territory: string;
    component: CircuitLeaf;
  }>;
}

// node_modules/@red-cup-engineering/computer-data-engine/identity/src/ni-uri.mjs
declare module "@red-cup-engineering/computer-data-engine/identity" {
  export const NI_URI_PATTERN: RegExp;
  export function makeNiUri(bytes: Uint8Array): string;
  export function isNiUri(value: unknown): boolean;
  // `value`'s internal `digestBytes` helper starts with `typeof value !==
  // "string"` (returning null / failing rather than throwing a TS-shaped
  // error), so these two accept `unknown` at the boundary just like
  // `isNiUri`/`verifyNiUri` do, not just validated strings.
  export function niUriDigest(value: unknown): string;
  export function niUriDigestBytes(value: unknown): Buffer;
  export function verifyNiUri(bytes: Uint8Array, value: unknown): boolean;
}
