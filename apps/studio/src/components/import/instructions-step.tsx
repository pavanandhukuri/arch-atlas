'use client';

export function InstructionsStep() {
  return (
    <div className="iw-step-content">
      <h2 className="iw-step-title">Run the Repo Importer</h2>
      <p className="iw-step-subtitle">
        The import wizard turns an <code>architecture.review.yaml</code> file into a diagram. That
        file is produced by pointing a coding agent at a workspace config &mdash; it runs the
        <code>@arch-atlas/llm-importer</code> pipeline end-to-end and writes the review file
        deterministically, correlating analysis artifacts with no model call of its own. Run it
        locally first, then come back here to load the result.
      </p>

      <ol className="iw-instructions-list">
        <li>
          <strong>Write a config file</strong>
          <p className="iw-step-hint">
            Create <code>import.yaml</code> pointing at your repositories and where the analysis
            artifacts and output should live:
          </p>
          <pre className="iw-code-block">
            {[
              "version: '2.0'",
              '',
              'output:',
              '  directory: ./architecture-output',
              '',
              'repositories:',
              '  - path: /path/to/service-a',
              '    name: Service A',
              '  - path: /path/to/service-b',
              '    name: Service B',
            ].join('\n')}
          </pre>
        </li>
        <li>
          <strong>Point a coding agent at it to import the workspace</strong>
          <p className="iw-step-hint">
            The importer core never talks to a model. Ask any coding agent (Claude Code, Cursor,
            Copilot, Codex, Windsurf, and more &mdash; against whatever model you&apos;ve configured
            it to use, local or hosted) to run the <code>plugins/repo-analysis</code> skill/plugin
            (an <code>AGENTS.md</code> procedure) against <code>import.yaml</code>. One request runs
            the whole pipeline itself: it gathers context, analyzes every listed repository (the one
            step touching a model), and then runs <code>import</code> &mdash; deterministic
            cross-repository correlation, no model call &mdash; to write{' '}
            <code>architecture.review.yaml</code> and <code>architecture.arch.json</code> into{' '}
            <code>output.directory</code>. No separate commands to run by hand. See{' '}
            <code>plugins/repo-analysis/README.md</code> for setup.
          </p>
        </li>
        <li>
          <strong>Locate the review file</strong>
          <p className="iw-step-hint">
            <code>architecture.review.yaml</code> (and <code>architecture.arch.json</code>) are now
            in your <code>output.directory</code>. The <code>.review.yaml</code> is the file
            you&apos;ll upload in the next step.
          </p>
        </li>
        <li>
          <strong>Continue below</strong>
          <p className="iw-step-hint">
            Click &ldquo;Next&rdquo; to load the review file and start classifying elements and
            reviewing connections.
          </p>
        </li>
      </ol>
    </div>
  );
}
