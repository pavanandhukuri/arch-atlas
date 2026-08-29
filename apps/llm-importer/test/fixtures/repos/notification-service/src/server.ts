import { createServer } from 'node:http';

/** Registers the /v1/send route behind the gateway prefix. */
export function routes() {
  return { send: '/v1/send' };
}

export const server = createServer();
