import { z } from "zod";
const id = z.string().min(1).max(180),
  text = z.string().max(2000),
  category = z.enum(["Hommes", "Femmes"]),
  lane = z.enum(["Commun", "Principale", "Consolante"]),
  target = z.union([z.literal(21), z.literal(25)]);
const rules = z.object({
  confirmed: z.boolean(),
  margin: z.union([z.literal(1), z.literal(2)]),
  crossGroup: z.enum(["place-first", "performance"]),
  referee: z.literal("resting-or-external"),
  bronze: z.boolean(),
});
const player = z.object({
  id,
  name: text,
  level: z.number().int().min(0).max(3),
  email: text,
  club: text,
});
const group = z.object({
  id,
  name: text,
  teamIds: z.array(id),
  courts: z.array(text).min(1).max(2),
});
const ref = z.object({
  type: z.enum(["team", "winner", "loser", "bye"]),
  id: z.string(),
});
const match = z.object({
  id,
  phaseId: id,
  groupId: id.optional(),
  order: z.number().int(),
  slot: z.number().int(),
  court: text,
  referee: text,
  a: id.nullable(),
  b: id.nullable(),
  refs: z.tuple([ref, ref]).optional(),
  round: z.number().int(),
  bronze: z.boolean().optional(),
  target,
  score: z.tuple([z.number().int(), z.number().int()]).nullable(),
  bye: z.boolean().optional(),
  forfeit: text.optional(),
});
const decisions = z.record(z.string(), z.array(id));
export const tournamentSchema = z.object({
  schema: z.literal(1),
  id,
  name: text,
  createdAt: text,
  modifiedAt: text,
  revision: z.number().int().nonnegative(),
  rules,
  teams: z.array(
    z.object({
      id,
      category,
      name: text,
      players: z.array(player),
      withdrawn: z.boolean(),
    }),
  ),
  phases: z.array(
    z.object({
      id,
      category,
      lane,
      kind: z.enum(["groups", "knockout"]),
      number: z.number().int().positive(),
      sourceId: id.nullable(),
      status: z.enum(["Préparation", "En cours", "Terminée"]),
      target,
      groups: z.array(group),
      matches: z.array(match),
      teamIds: z.array(id),
      teamNames: z.record(z.string(), text),
      levels: z.record(z.string(), z.number()),
      createdAt: text,
      rules,
      seeds: z.array(id).optional(),
      decisions,
    }),
  ),
  splits: z.array(
    z.object({
      id,
      category,
      sourceId: id,
      principale: z.array(id),
      consolante: z.array(id),
      createdAt: text,
      ranking: z.array(id),
    }),
  ),
  documents: z.array(
    z.object({
      id,
      phaseId: id,
      groupId: id.optional(),
      matchId: id.optional(),
      file: text,
      revision: z.number().int(),
      pages: z.number().int(),
    }),
  ),
  audit: z.array(
    z.object({
      id,
      at: text,
      action: text,
      detail: z.unknown(),
      revision: z.number().int(),
    }),
  ),
  archives: z.array(z.unknown()),
  preferredSize: z.number().int(),
});
