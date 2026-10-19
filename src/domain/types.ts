export type Category = "Hommes" | "Femmes";
export type Lane = "Commun" | "Principale" | "Consolante";
export type Target = 21 | 25;
export interface Player {
  id: string;
  name: string;
  level: number;
  email: string;
  club: string;
}
export interface Team {
  id: string;
  category: Category;
  name: string;
  players: Player[];
  withdrawn: boolean;
}
export interface Rules {
  confirmed: boolean;
  margin: 1 | 2;
  crossGroup: "place-first" | "performance";
  referee: "resting-or-external";
  bronze: boolean;
}
export interface Group {
  id: string;
  name: string;
  teamIds: string[];
  courts: string[];
}
export interface Ref {
  type: "team" | "winner" | "loser" | "bye";
  id: string;
}
export interface Match {
  id: string;
  phaseId: string;
  groupId?: string;
  order: number;
  slot: number;
  court: string;
  referee: string;
  a: string | null;
  b: string | null;
  refs?: [Ref, Ref];
  round: number;
  bronze?: boolean;
  target: Target;
  score: [number, number] | null;
  bye?: boolean;
  forfeit?: string;
}
export interface Phase {
  id: string;
  category: Category;
  lane: Lane;
  kind: "groups" | "knockout";
  number: number;
  sourceId: string | null;
  status: "Préparation" | "En cours" | "Terminée";
  target: Target;
  groups: Group[];
  matches: Match[];
  teamIds: string[];
  teamNames: Record<string, string>;
  levels: Record<string, number>;
  createdAt: string;
  rules: Rules;
  seeds?: string[];
  decisions: Record<string, string[]>;
}
export interface Split {
  id: string;
  category: Category;
  sourceId: string;
  principale: string[];
  consolante: string[];
  createdAt: string;
  ranking: string[];
}
export interface Audit {
  id: string;
  at: string;
  action: string;
  detail: unknown;
  revision: number;
}
export interface Document {
  id: string;
  phaseId: string;
  groupId?: string;
  matchId?: string;
  file: string;
  revision: number;
  pages: number;
}
export interface Tournament {
  schema: 1;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  revision: number;
  rules: Rules;
  teams: Team[];
  phases: Phase[];
  splits: Split[];
  documents: Document[];
  audit: Audit[];
  archives: unknown[];
  preferredSize: number;
}
export interface Standing {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  scored: number;
  conceded: number;
  diff: number;
  place: number;
  groupId: string;
}
export type Command =
  | { type: "rules"; rules: Rules }
  | { type: "team"; team: Team }
  | { type: "withdraw"; teamId: string; withdrawn: boolean }
  | { type: "demo-teams"; category: Category; count: number }
  | {
      type: "draft";
      category: Category;
      lane: Lane;
      structure: number[];
      target: Target;
      preferredSize?: number;
    }
  | { type: "draft-update"; phaseId: string; groups: Group[]; target: Target }
  | { type: "draft-delete"; phaseId: string }
  | { type: "confirm"; phaseId: string }
  | {
      type: "score";
      phaseId: string;
      matchId: string;
      score: [number, number];
      correction?: boolean;
      acknowledge?: boolean;
    }
  | { type: "random"; phaseId: string }
  | {
      type: "split";
      phaseId: string;
      count: number;
      decisions: Record<string, string[]>;
    }
  | {
      type: "knockout";
      phaseId: string;
      lane: Lane;
      count: number;
      decisions: Record<string, string[]>;
      earlyTarget: Target;
      finalTarget: Target;
      bronze: boolean;
    }
  | {
      type: "match-details";
      phaseId: string;
      matchId: string;
      court: string;
      referee: string;
    };
export interface Session {
  tournament: Tournament;
  path: string;
  warning?: string;
}
export interface Recent {
  name: string;
  path: string;
  at: string;
}
export interface Reply<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}
export interface Api {
  call<T = unknown>(method: string, args?: unknown): Promise<Reply<T>>;
}
declare global {
  interface Window {
    volley: Api;
  }
}
