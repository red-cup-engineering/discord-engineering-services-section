import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";

export function identifyTurntideDiscordPlatformRecord(value) {
  return identifyJsonSemanticContent({ objectKind: "turntide-islands.discord-platform-record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
}
