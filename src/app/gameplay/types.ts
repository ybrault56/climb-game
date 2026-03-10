export type RunStatus = "idle" | "running" | "failed";

export type ObstacleKind = "solid_wall" | "tight_gate" | "low_wall" | "breakable_wall";
export type ObstacleSignature = "neutral" | "needle_gate" | "chevron_shutter" | "prism_clamp";
export type PassQuality = "near_miss" | "perfect_pass" | "clean_pass" | "jump_clear" | "wall_break";

export type BonusKind =
  | "shard"
  | "fireball"
  | "missile_burst"
  | "ghost_core"
  | "score_burst"
  | "shield"
  | "magnet";

export type RankTier = "C" | "B" | "A" | "S" | "SS";

export interface InputFrame {
  targetX: number | null;
  driftDirection: -1 | 0 | 1;
  jumpPressed: boolean;
  retryPressed: boolean;
}

export interface PlayerState {
  x: number;
  velocityX: number;
  y: number;
  velocityY: number;
  jumpCooldownMs: number;
  jumpCount: number;
}

// Legacy state kept for backward-compatible local stats fields.
export interface PhaseShiftState {
  activeMsRemaining: number;
  cooldownMsRemaining: number;
  activationCount: number;
  savedCollisionCount: number;
}

export interface PowerState {
  fireballMsRemaining: number;
  missileMsRemaining: number;
  missileShotCooldownMs: number;
  ghostMsRemaining: number;
  shieldCharges: number;
  magnetMsRemaining: number;
  fireballPickupCount: number;
  missilePickupCount: number;
  ghostPickupCount: number;
  fireballBreakCount: number;
  missileBreakCount: number;
}

export interface ObstacleState {
  id: number;
  y: number;
  gapCenterX: number;
  gapWidth: number;
  kind: ObstacleKind;
  thicknessPx: number;
  signature: ObstacleSignature;
  risk: number;
}

export interface BonusState {
  id: number;
  x: number;
  y: number;
  kind: BonusKind;
  value: number;
}

export interface PassEvent {
  obstacleId: number;
  obstacleKind: ObstacleKind;
  obstacleSignature: ObstacleSignature;
  quality: PassQuality;
  risk: number;
}

export interface BonusCollectEvent {
  bonusId: number;
  kind: BonusKind;
  value: number;
  x: number;
  y: number;
}

export interface DifficultySnapshot {
  level: number;
  scrollSpeed: number;
  spawnEveryMs: number;
  gapWidth: number;
  obstacleKinds: readonly ObstacleKind[];
}

export interface ScoreState {
  current: number;
  best: number;
  precisionChain: number;
  survivalMs: number;
  bonusScore: number;
  nearMissCount: number;
  perfectPassCount: number;
  flowLevel: number;
  phaseBonusScore: number;
  phasePrecisionCount: number;
  combo: number;
  comboPeak: number;
  comboTimerMs: number;
  multiplier: number;
  shardCount: number;
  fireballBreakCount: number;
  missileBreakCount: number;
  rank: RankTier;
}

export interface RunSnapshot {
  status: RunStatus;
  elapsedMs: number;
  player: PlayerState;
  phase: PhaseShiftState;
  power: PowerState;
  obstacles: readonly ObstacleState[];
  bonuses: readonly BonusState[];
  difficulty: DifficultySnapshot;
  score: ScoreState;
}
