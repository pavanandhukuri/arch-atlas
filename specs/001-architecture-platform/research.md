# Security Hardening Notes

## File Import Sanitization

### Current Implementation (MVP)

The import policy enforces strict validation:

1. **Schema Version Validation**
   - Rejects files with missing `schemaVersion` field
   - Rejects files with unknown schema versions
   - Only accepts known versions: `['0.1.0']`

2. **Unknown Fields Rejection**
   - Validates top-level fields against known schema
   - Rejects files with any unknown fields
   - Known fields: `schemaVersion`, `metadata`, `elements`, `relationships`, `constraints`, `views`

3. **JSON Parsing Safety**
   - Uses standard `JSON.parse()` with try/catch
   - Returns structured errors on parse failure
   - No `eval()` or dynamic code execution

### Recommendations for Production

1. **Deep Field Validation**
   - Current implementation only validates top-level fields
   - Consider JSON Schema validation for nested fields
   - Use a library like `ajv` for full schema enforcement

2. **File Size Limits**
   - Implement maximum file size check (e.g., 10MB)
   - Prevent memory exhaustion from large JSON files

3. **Content-Type Validation**
   - Verify MIME type is `application/json`
   - Consider magic number validation for additional security

4. **Sanitization of User-Provided Strings**
   - Element names, descriptions, and metadata fields are user-provided
   - Ensure proper escaping when rendering in HTML
   - React provides XSS protection by default, but be cautious with `dangerouslySetInnerHTML`

## Safe UI Rendering

### Current Implementation

1. **React XSS Protection**
   - All user content rendered via React's JSX (automatic escaping)
   - No use of `dangerouslySetInnerHTML` in current implementation
   - Text inputs and textareas properly bound to state

2. **File Download Safety**
   - Export uses `Blob` and `URL.createObjectURL`
   - URLs properly revoked after download
   - Filename sanitized (lowercase, spaces to hyphens)

### Recommendations for Production

1. **Content Security Policy (CSP)**
   - Add CSP headers to prevent inline script execution
   - Restrict script sources to trusted domains
   - Example: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';`

2. **Input Validation**
   - Enforce maximum lengths for names and descriptions
   - Validate element IDs follow expected format
   - Sanitize filenames on export to prevent path traversal

3. **LocalStorage Security**
   - Autosave data stored in localStorage (browser-local only)
   - Consider encrypting sensitive model data before storage
   - Warn users about browser access to localStorage

4. **Canvas/PixiJS Security**
   - PixiJS renders WebGL content from trusted model data
   - No user-provided URLs or external resources loaded
   - If adding image/icon support, validate URLs and use CORS

## Threat Model

### In Scope for MVP

- **Malicious JSON Import**: User imports crafted JSON to exploit parser or validation
- **XSS via User Content**: User creates elements with malicious names/descriptions
- **LocalStorage Tampering**: Attacker modifies autosaved data in browser storage

### Out of Scope for MVP (Future Considerations)

- **Multi-user Collaboration**: Not implemented in MVP (single-user mode)
- **Server-Side Attacks**: Studio is browser-only, no backend API
- **Supply Chain Attacks**: Covered by dependabot and pnpm audit (see constitution)

## Action Items

- [X] Implement strict import validation (schema version + unknown fields)
- [X] Use React's built-in XSS protection (no dangerouslySetInnerHTML)
- [X] Sanitize export filenames
- [ ] Add CSP headers (deferred to deployment phase)
- [ ] Implement file size limits for import (recommend 10MB max)
- [ ] Add input length validation for element names/descriptions
- [ ] Consider JSON Schema validation library for deep validation
- [ ] Add security section to CONTRIBUTING.md reminding contributors about XSS risks

## References

- OWASP JSON Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Security_Cheat_Sheet.html
- React Security Best Practices: https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml
- Content Security Policy Guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
