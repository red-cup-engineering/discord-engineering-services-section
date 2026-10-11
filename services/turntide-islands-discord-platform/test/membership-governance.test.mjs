import assert from "node:assert/strict";
import test from "node:test";
import { membershipProgram } from "../src/turntide-software-system/index.mjs";
import { joinCommunityInstructions } from "../src/turntide-software-system/community-commands.mjs";

test("membership, paid products and Discord roles do not imply governance standing", () => {
  assert.match(membershipProgram.governance, /do not grant Turntide governance or voting standing/u);
  assert.match(membershipProgram.governance, /separate participation relation/u);
  assert.match(membershipProgram.governance, /optional for every member/u);
});

test("the join instructions state the governance boundary", () => {
  const instructions = joinCommunityInstructions();
  assert.ok(instructions.includes(membershipProgram.governance));
  assert.match(instructions, /free to join/u);
});
