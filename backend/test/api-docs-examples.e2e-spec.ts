import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

interface Schema {
  $ref?: string;
  type?: string;
  example?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  items?: Schema;
  minItems?: number;
  allOf?: Schema[];
}

interface Operation {
  requestBody?: { content: { 'application/json'?: { schema: Schema } } };
}

interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

type Method = 'post' | 'put' | 'patch';

interface Call {
  method: Method;
  path: string;
  body: unknown;
}

function resolve(ref: string, document: OpenApiDocument): Schema {
  const schema = document.components.schemas[ref.split('/').pop() ?? ''];
  if (schema === undefined) {
    throw new Error(`Unknown schema ${ref}`);
  }
  return schema;
}

/**
 * The body Swagger UI pre-fills when you press "Try it out", built the way
 * Swagger UI builds it: a field's own example if it has one; otherwise the
 * examples of its parts. A list without an example of its own is its one
 * item example, repeated until `minItems` is reached.
 */
function exampleOf(schema: Schema, document: OpenApiDocument): unknown {
  if (schema.example !== undefined) {
    return schema.example;
  }
  if (schema.$ref !== undefined) {
    return exampleOf(resolve(schema.$ref, document), document);
  }
  if (schema.allOf?.[0] !== undefined) {
    return exampleOf(schema.allOf[0], document);
  }
  if (schema.properties !== undefined) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [
        name,
        exampleOf(property, document),
      ]),
    );
  }
  if (schema.items !== undefined) {
    const item = exampleOf(schema.items, document);
    return Array.from(
      { length: Math.max(1, schema.minItems ?? 1) },
      () => item,
    );
  }
  if (schema.enum?.[0] !== undefined) {
    return schema.enum[0];
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return 0;
  }
  return schema.type === 'boolean' ? true : 'string';
}

/**
 * The order the calls must run in: register first (it gives the cookie),
 * then login, then the onboarding screens (later routes need them), then
 * everything that creates something, then a focus session (it starts on
 * a step, so the step must be there) and its end, then routes for one
 * item (they end in `/{id}`). Among the creating routes a parent sorts
 * before what is created under it: `/api/goals`, then
 * `/api/goals/{goalId}/tasks`, then `/api/tasks/{taskId}/steps`.
 */
function rank(path: string): number {
  if (path === '/api/auth/register') return 0;
  if (path.startsWith('/api/auth/')) return 1;
  if (path.startsWith('/api/profile/sections/')) return 2;
  if (path === '/api/sessions') return 4;
  if (path.startsWith('/api/sessions/')) return 5;
  return path.endsWith('}') ? 6 : 3;
}

/** `tasks` for `/api/goals/{goalId}/tasks`: what a POST there creates. */
function lastSegment(path: string): string {
  return path.split('/').pop() ?? '';
}

/**
 * One kind of example cannot be right as it stands: an id in a body, such
 * as `stepId` or the list `stepIds`, must name the caller's own item. Here
 * it becomes the id the `steps` example created, which is what a person
 * does by hand in Swagger: copy the id from the answer above and paste it
 * in.
 */
function withCreatedIds(body: unknown, created: Map<string, string>): unknown {
  if (typeof body !== 'object' || body === null) {
    return body;
  }
  return Object.fromEntries(
    Object.entries(body).map(([name, value]) => {
      const [, collection, list] = /^(\w+)Id(s?)$/.exec(name) ?? [];
      const id =
        collection === undefined ? undefined : created.get(`${collection}s`);
      if (id === undefined) {
        return [name, value];
      }
      return [name, list === 's' ? [id] : id];
    }),
  );
}

/** Every route in the document that takes a JSON body, with its example. */
function callsWithBodies(document: OpenApiDocument): Call[] {
  const calls: Call[] = [];
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const schema = operation.requestBody?.content['application/json']?.schema;
      if (schema !== undefined) {
        calls.push({
          method: method as Method,
          path,
          body: exampleOf(schema, document),
        });
      }
    }
  }
  return calls.sort(
    (a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path),
  );
}

// The "Check it" steps in docs/ say: Try it out → Execute. That only works
// if the pre-filled example is a body the API accepts. These tests keep the
// two from drifting apart; they found two real defects the day they were
// written (a list example that repeated one value, and optional text fields
// published as objects).
describe('API docs examples', () => {
  let app: INestApplication<App>;

  async function openApiDocument(): Promise<OpenApiDocument> {
    const response = await request(app.getHttpServer()).get('/api/docs-json');
    return response.body as OpenApiDocument;
  }

  beforeAll(async () => {
    app = await createTestApp({ apiDocs: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts every request example exactly as Swagger pre-fills it', async () => {
    resetRateLimits(app);
    const calls = callsWithBodies(await openApiDocument());
    let cookie = '';
    // Collection (`goals`, `tasks`) → id of the item its example created.
    // A path parameter stands for an item of the collection named just
    // before it: `goals/{goalId}`, `tasks/{id}`.
    const created = new Map<string, string>();
    const refused: string[] = [];

    for (const call of calls) {
      const path = call.path.replace(
        /([^/]+)\/\{\w+\}/g,
        (match, collection: string) =>
          `${collection}/${created.get(collection) ?? match}`,
      );
      let req = request(app.getHttpServer())[call.method](path);
      if (cookie !== '') {
        req = req.set('Cookie', cookie);
      }
      const response = await req.send(
        withCreatedIds(call.body, created) as object,
      );

      if (call.path === '/api/auth/register') {
        cookie = cookieHeader(sessionToken(response));
      }
      const id = (response.body as { id?: unknown }).id;
      if (call.method === 'post' && typeof id === 'string') {
        created.set(lastSegment(call.path), id);
      }
      if (response.status >= 300) {
        refused.push(
          `${call.method.toUpperCase()} ${call.path} → ${String(response.status)} ${JSON.stringify(response.body)}`,
        );
      }
    }

    expect(refused).toEqual([]);
    // The loop really ran over the routes that matter.
    expect(calls.map((call) => call.path)).toEqual(
      expect.arrayContaining([
        '/api/auth/register',
        '/api/profile/sections/values',
        '/api/goals',
        '/api/goals/{id}',
        '/api/goals/{goalId}/tasks',
        '/api/tasks/{id}',
        '/api/tasks/{taskId}/steps',
        '/api/tasks/{taskId}/steps/order',
        '/api/sessions',
        '/api/sessions/{id}/end',
        '/api/steps/{id}',
      ]),
    );
  });

  it('publishes every text field as a string', async () => {
    const { schemas } = (await openApiDocument()).components;

    const wrong: string[] = [];
    for (const [name, schema] of Object.entries(schemas)) {
      for (const [property, definition] of Object.entries(
        schema.properties ?? {},
      )) {
        if (
          typeof definition.example === 'string' &&
          definition.type !== 'string'
        ) {
          wrong.push(
            `${name}.${property} is published as ${String(definition.type)}`,
          );
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});
