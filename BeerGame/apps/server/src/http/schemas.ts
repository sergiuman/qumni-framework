import { z } from 'zod';

export const CreateSessionSchema = z.object({
  title: z.string().min(1),
  scenarioId: z.string().optional()
});

export const PatchSessionSchema = z.object({
  status: z.enum(['draft', 'lobby', 'running', 'finished', 'closed'])
});

export const CreateTeamsSchema = z.object({
  mode: z.enum(['random', 'manual']).default('random'),
  teamCount: z.number().int().min(1).default(1),
  teamSize: z.number().int().min(1).default(4),
  names: z.array(z.string()).optional()
});

export const CreateRunSchema = z.object({
  scenarioId: z.string().optional(),
  advancement: z.enum(['timer', 'wait_all', 'async']).default('timer'),
  roundSeconds: z.number().int().min(5).max(300).nullable().default(60),
  label: z.string().default('Run 1')
});

export const SubstituteBotSchema = z.object({
  policy: z.enum(['naive', 'base-stock', 'sterman', 'scripted']).default('base-stock'),
  params: z.record(z.any()).optional()
});

export const AssignSeatSchema = z.object({
  playerId: z.string().min(1)
});

export const JoinSchema = z.object({
  joinCode: z.string().min(1).toUpperCase(),
  displayName: z.string().min(1).max(50)
});

export const RejoinSchema = z.object({
  playerToken: z.string().min(1)
});

export const SubmitOrderSchema = z.object({
  week: z.number().int().min(1),
  quantity: z.number().int().min(0),
  clientMsgId: z.string().optional()
});

export const SubmitUtteranceSchema = z.object({
  promptId: z.string().min(1),
  kind: z.enum(['belief', 'reflection', 'mental_model']),
  body: z.string().min(1),
  week: z.number().int().optional(),
  clientMsgId: z.string().optional()
});

export const SubmitPredictionSchema = z.object({
  scope: z.enum(['run', 'experiment']).default('run'),
  statement: z.string().min(1),
  predictedDirection: z.enum(['up', 'down', 'same', 'unsure']).optional()
});
