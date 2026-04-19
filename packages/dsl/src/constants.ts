export const SUPPORTED_DSL_VERSION = '1';

export const DSL_FORMAT_DESCRIPTION = `
arch-atlas DSL format (version 1):

Elements: <kind> "<name>" [optional attrs] { optional children }
Kinds: landscape, person, system, container, component, code
Nesting: containers inside system blocks, components inside container blocks

Inline attrs [key="value", ...]:
  description, technology, tags, external (system only, "true"/"false")
  subtype (container: database|storage-bucket|static-content|user-interface|backend-service)
  bg, border, font (hex colors, e.g. "#ff0000")

Relationships: "<source>" -> "<target>" [type="<type>", label="<label>"]
  Optional attrs: type, label, action, integration, description, tags

Version header (optional): version "1"
Comments: lines starting with # are ignored
Forward references in relationships are supported.

Example:
version "1"
person "Customer"
system "Web App" {
  container "Frontend" [technology="React", subtype="user-interface"]
  container "Backend"  [technology="Node.js", subtype="backend-service"]
}
"Customer" -> "Web App" [type="uses", label="Browses"]
`.trim();
