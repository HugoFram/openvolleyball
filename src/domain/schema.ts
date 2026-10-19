import { z } from "zod";
const id = z.string().min(1).max(180),
  text = z.string().max(2000),
  category = z.enum(["Hommes", "Femmes"]),
  lane = z.enum(["Commun", "Principale", "Consolante"]),
  target = z.union([z.literal(21), z.literal(25)]);
const rules = z.object({
  confirmed: z.boolean(),
  margin: z.union([z.literal(1), z.literal(2)]),
  crossGroup: z.enum(["place-first", "performance", "win-rate"]),
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
  scoredMargin: z.union([z.literal(1), z.literal(2)]).optional(),
  bye: z.boolean().optional(),
  forfeit: text.optional(),
});
const decisions = z.record(z.string(), z.array(id));
const rect = z.tuple([
  z.number(),
  z.number(),
  z.number().positive(),
  z.number().positive(),
]);
const paperForm = z.object({
  id,
  documentId: id,
  tournamentId: id,
  version: z.literal(1),
  page: z.number().int().positive(),
  kind: z.enum(["scores", "registration"]),
  label: text,
  category,
  phaseId: id.optional(),
  groupId: id.optional(),
  teamId: id.optional(),
  sourceHash: text.optional(),
  fixtureKey: z.string().max(30000).optional(),
  qr: rect,
  region: rect
    .refine(
      ([x, y, w, h]) =>
        x >= 0 &&
        y >= 0 &&
        w <= 595.28 &&
        h <= 841.89 &&
        x + w <= 595.29 &&
        y + h <= 841.9,
      "Région de fiche invalide",
    )
    .optional(),
  fields: z.array(
    z.object({
      key: id,
      label: text,
      rect,
      digits: z.array(rect).optional(),
      choices: z.array(z.object({ value: text, rect })).optional(),
      matchId: id.optional(),
      side: z.union([z.literal(0), z.literal(1)]).optional(),
    }),
  ),
  participants: z.record(z.string(), z.tuple([id.nullable(), id.nullable()])),
});
export const tournamentSchema = z.object({
  paperForms: z.array(paperForm).optional(),
  scanSources: z
    .array(
      z.object({
        id,
        name: text,
        file: text,
        hash: text,
        importedAt: text,
        processed: z.boolean().optional(),
        error: text.optional(),
      }),
    )
    .optional(),
  scanPages: z
    .array(
      z.object({
        id,
        sourceId: id,
        page: z.number().int().positive(),
        formId: id.optional(),
        image: text,
        aligned: z.boolean().optional(),
        status: z.enum(["pending", "approved", "ignored"]),
        note: text.optional(),
        values: z.record(
          z.string(),
          z.object({
            value: text,
            confidence: z.number().min(0).max(1).optional(),
            alternatives: z.array(z.string().max(3)).max(5).optional(),
            issue: text.optional(),
            reader: z
              .enum(["contrast-v2", "style-cnn-v3", "trocr-v1"])
              .optional(),
          }),
        ),
        originalValues: z
          .record(
            z.string(),
            z.object({
              value: text,
              confidence: z.number().min(0).max(1).optional(),
              alternatives: z.array(z.string().max(3)).max(5).optional(),
              issue: text.optional(),
              reader: z
                .enum(["contrast-v2", "style-cnn-v3", "trocr-v1"])
                .optional(),
            }),
          )
          .optional(),
        approvedAt: text.optional(),
        accepted: z.record(z.string(), text).optional(),
        appliedIds: z.array(id).optional(),
      }),
    )
    .optional(),
  schema: z.union([z.literal(1), z.literal(2)]),
  id,
  name: text,
  createdAt: text,
  branding: z
    .object({
      website: z.string().max(500).optional(),
      logo: z
        .string()
        .max(1500000)
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
    })
    .optional(),
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
      previousRanks: z.record(z.string(), z.number()).optional(),
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
      forms: z.array(paperForm).optional(),
      id,
      phaseId: id.optional(),
      kind: z.enum(["blank-registration", "team-registration"]).optional(),
      teamId: id.optional(),
      category: category.optional(),
      sourceHash: z.string().optional(),
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
