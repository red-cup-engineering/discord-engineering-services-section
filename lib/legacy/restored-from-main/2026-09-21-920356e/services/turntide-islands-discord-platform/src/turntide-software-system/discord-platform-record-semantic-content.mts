import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/relation-model-notation-runtime/semantic-content-identity";

export function identifyTurntideDiscordPlatformRecord(value: unknown): string {
  return identifyJsonSemanticContent({ objectKind: "turntide-islands.discord-platform-record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
}
