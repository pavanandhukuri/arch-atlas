import type { TopicRef } from '../types.js';

/**
 * Pub/sub topic literal extraction — literals only, no dataflow. Ported
 * from understand-everything's linker core.
 */

const PUB_RE = /\.\s*(?:publish|emit|send(?:Message)?)\s*\(\s*["'`]([^"'`\n$]+)["'`]/g;
const SUB_RE = /\.\s*(?:subscribe|on|consume|receiveMessage)\s*\(\s*["'`]([^"'`\n$]+)["'`]/g;
// Case-insensitive: Go exports struct fields capitalized (kafka.ReaderConfig{Topic: "..."}),
// unlike the lowerCamelCase convention this pattern otherwise assumes.
const KAFKA_TOPIC_RE = /topic\s*[=:]\s*["'`]([^"'`\n$]+)["'`]/gi;

/**
 * Common words and too-short strings are never treated as topic evidence
 * directly; the pass demotes them. The extractor reports everything and lets
 * the pass decide, so tests can see raw evidence.
 */
export const TOPIC_NOISE_WORDS = new Set([
  'test',
  'debug',
  'main',
  'default',
  'error',
  'close',
  'data',
  'message',
  'connect',
  'disconnect',
  'open',
  'end',
  'click',
  'change',
  'submit',
  'load',
]);

export function extractTopicRefs(relPath: string, content: string): TopicRef[] {
  const refs: TopicRef[] = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const [re, role] of [
      [PUB_RE, 'pub'],
      [SUB_RE, 'sub'],
    ] as Array<[RegExp, TopicRef['role']]>) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        if (m[1]) refs.push({ relPath, line: index + 1, topic: m[1], role });
      }
    }
    KAFKA_TOPIC_RE.lastIndex = 0;
    for (const m of line.matchAll(KAFKA_TOPIC_RE)) {
      // Direction isn't inferable from a bare `topic=` assignment — the pass
      // pairs "unknown" refs only with a definite opposite, at lower weight.
      if (m[1]) refs.push({ relPath, line: index + 1, topic: m[1], role: 'unknown' });
    }
  });
  return refs;
}

export function isNoiseTopic(topic: string): boolean {
  return topic.length < 4 || TOPIC_NOISE_WORDS.has(topic.toLowerCase());
}
