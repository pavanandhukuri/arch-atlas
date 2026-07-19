# Bundled schemas

`architecture-model.schema.json` is a copy of `packages/model-schema/src/architecture-model.schema.json`
from the arch-atlas monorepo. It is bundled here so the tool validates its output correctly when
installed as a standalone pip package outside the monorepo.

When the schema evolves in `packages/model-schema`, copy the updated file here and bump the package version.
