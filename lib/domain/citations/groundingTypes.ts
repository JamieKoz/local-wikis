export type GroundingCheckResult = {
  grounded: boolean;
  confidence: number;
  supportingChunkIds: string[];
  uncoveredClaims: string[];
};
