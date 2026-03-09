export interface LeaderboardGateway {
  submit(score: number): Promise<void>;
  listTop(limit: number): Promise<readonly number[]>;
}
