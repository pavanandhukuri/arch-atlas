# Model Schema

**@archatlas/model-schema** provides JSON schemas for the Arch Atlas architecture model.

## Purpose

- Canonical JSON schemas for `ArchitectureModel` and `ChangeProposal`
- Versioned, language-agnostic format definitions
- Suitable for validation, code generation, and documentation

## Installation

```bash
pnpm add @archatlas/model-schema
```

## Usage

```typescript
import { architectureModelSchema, changeProposalSchema } from '@archatlas/model-schema';

console.log(architectureModelSchema);
// {
//   "$schema": "http://json-schema.org/draft-07/schema#",
//   "$id": "https://arch-atlas.dev/schemas/architecture-model-0.1.0.json",
//   ...
// }
```

## Schemas

- `architecture-model.schema.json`: Full architecture model format
- `change-proposal.schema.json`: Change proposal format

## License

See [LICENSE](../../LICENSE) in the monorepo root.
