import { Type, type Static } from 'typebox';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { ModelAnalysisSchema, type ModelAnalysis } from './repo-analysis.schema.js';

/**
 * research.md D14.6 (opt-in, `analysis.structuredOutput: "tool"`): instead of
 * asking the model for free-form JSON text and parsing it, expose ONE tool
 * whose parameters ARE the analysis shape, with provider-side constrained
 * sampling requested. Where the endpoint honours it (oMLX guided grammar,
 * vLLM/TGI json-schema), the model physically cannot emit a malformed or
 * mistyped object. Where it doesn't, `analyze-repo.ts` falls back to the
 * hardened text path.
 *
 * The TypeBox schema below mirrors `ModelAnalysisSchema` (zod). A drift guard
 * lives in `test/unit/submit-analysis-tool.test.ts`: the same fixtures must
 * pass/fail against both.
 */

const HttpMethod = Type.Union([
  Type.Literal('GET'),
  Type.Literal('POST'),
  Type.Literal('PUT'),
  Type.Literal('PATCH'),
  Type.Literal('DELETE'),
  Type.Literal('HEAD'),
  Type.Literal('OPTIONS'),
  Type.Literal('ANY'),
]);

const HttpRoute = Type.Object({
  method: Type.Optional(HttpMethod),
  path: Type.String({ pattern: '^/' }),
  filePath: Type.Optional(Type.String({ minLength: 1 })),
});

const TopicInterface = Type.Object({
  name: Type.String({ minLength: 1 }),
  direction: Type.Union([
    Type.Literal('publish'),
    Type.Literal('consume'),
    Type.Literal('unknown'),
  ]),
  filePath: Type.Optional(Type.String({ minLength: 1 })),
});

const Datastore = Type.Object({
  name: Type.String({ minLength: 1 }),
  kind: Type.Optional(
    Type.Union([
      Type.Literal('relational'),
      Type.Literal('document'),
      Type.Literal('keyvalue'),
      Type.Literal('blob'),
      Type.Literal('search'),
      Type.Literal('other'),
    ])
  ),
});

const OutboundIntent = Type.Object({
  target: Type.String({ minLength: 1 }),
  verb: Type.Union([
    Type.Literal('calls'),
    Type.Literal('depends_on'),
    Type.Literal('publishes'),
    Type.Literal('subscribes'),
    Type.Literal('reads_from'),
    Type.Literal('writes_to'),
  ]),
  detail: Type.String(),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export const SubmitAnalysisParams = Type.Object({
  description: Type.String(),
  languages: Type.Array(Type.String()),
  frameworks: Type.Array(Type.String()),
  served: Type.Object({
    httpRoutes: Type.Array(HttpRoute),
    grpcServices: Type.Array(Type.String({ minLength: 1 })),
    topics: Type.Array(TopicInterface),
    datastores: Type.Array(Datastore),
  }),
  outbound: Type.Array(OutboundIntent),
});
export type SubmitAnalysisParamsT = Static<typeof SubmitAnalysisParams>;

export interface SubmitAnalysisTool {
  tool: ToolDefinition;
  /** The last params the model submitted, re-validated through the zod schema
   * (authoritative), or null if the tool was never called. */
  getResult(): ModelAnalysis | null;
}

/**
 * Builds the `submit_analysis` tool plus a `getResult()` closure that
 * `analyze-repo.ts` reads after `session.prompt()` resolves. `execute` captures
 * the params, asks the agent to stop, and returns a trivial success.
 */
export function createSubmitAnalysisTool(): SubmitAnalysisTool {
  let captured: ModelAnalysis | null = null;

  const tool = defineTool({
    name: 'submit_analysis',
    label: 'Submit repository analysis',
    description:
      'Call this exactly once with your complete analysis of the repository. ' +
      'Every field is required; use empty arrays where there is nothing.',
    parameters: SubmitAnalysisParams,
    constrainedSampling: { type: 'json_schema', strict: 'prefer' },
    execute: (_toolCallId, params) => {
      const parsed = ModelAnalysisSchema.safeParse(params);
      if (parsed.success) captured = parsed.data;
      return Promise.resolve({
        content: [{ type: 'text' as const, text: parsed.success ? 'recorded' : 'invalid' }],
        details: {},
        terminate: true,
      });
    },
  });

  return { tool, getResult: () => captured };
}
