import express from 'express';
import { z, ZodError } from 'zod';
import { createDb, ensureSchema } from './db.js';

const UserCreate = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable().optional(),
});

const PostCreate = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
});

const app = express();
app.use(express.json());

const { db, pool, driver, Types } = await createDb();
await ensureSchema(pool, Types);

const asyncHandler =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// USERS
app.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await db.user.findMany({ orderBy: [{ id: 'ASC' }] });
    res.json(users);
  }),
);

app.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await db.user.findUnique({ where: { id: { '=': req.params.id } } });
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json(user);
  }),
);

app.post(
  '/users',
  asyncHandler(async (req, res) => {
    const input = UserCreate.parse(req.body);
    const created = await db.user.create({
      data: { ...input, name: input.name ?? null },
      returning: { id: true, email: true, name: true },
    });
    res.status(201).json(created);
  }),
);

app.put(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const patch = UserCreate.partial().parse(req.body);
    const updated = await db.user.update({
      where: { id: { '=': req.params.id } },
      data: patch,
      returning: { id: true, email: true, name: true },
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  }),
);

app.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    await db.user.delete({ where: { id: { '=': req.params.id } } });
    res.status(204).send();
  }),
);

// POSTS
app.get(
  '/posts',
  asyncHandler(async (_req, res) => {
    const posts = await db.post.findMany({ orderBy: [{ createdAt: 'DESC' }] });
    res.json(posts);
  }),
);

app.get(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const post = await db.post.findUnique({ where: { id: { '=': req.params.id } } });
    if (!post) return res.status(404).json({ error: 'not_found' });
    res.json(post);
  }),
);

app.post(
  '/posts',
  asyncHandler(async (req, res) => {
    const input = PostCreate.parse(req.body);
    const created = await db.post.create({
      data: {
        ...input,
        body: input.body ?? null,
        createdAt: new Date(),
      },
      returning: { id: true, userId: true, title: true, body: true, createdAt: true },
    });
    res.status(201).json(created);
  }),
);

app.put(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const patch = PostCreate.partial().parse(req.body);
    const updated = await db.post.update({
      where: { id: { '=': req.params.id } },
      data: patch,
      returning: { id: true, userId: true, title: true, body: true, createdAt: true },
    });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  }),
);

app.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    await db.post.delete({ where: { id: { '=': req.params.id } } });
    res.status(204).send();
  }),
);

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'bad_request', issues: err.issues });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`listening on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  server.close();
  await pool.destroy();
  await driver.destroy();
  process.exit(0);
});
