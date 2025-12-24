
export interface DataRow {
  key: string;
  value: string;
}

export interface MatchResult extends DataRow {
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  DATA_LOADED = 'DATA_LOADED',
  PROCESSING = 'PROCESSING'
}
