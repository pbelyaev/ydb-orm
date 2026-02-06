import express from 'express';
import { z } from 'zod';
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

// USERS
app.get('/users', async (_req, res) => {
  const users = await db.user.findMany({ orderBy: [{ id: 'ASC' }] });
  res.json(users);
});

app.get('/users/:id', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: { '=': req.params.id } } as any });
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json(user);
});

app.post('/users', async (req, res) => {
  const input = UserCreate.parse(req.body);
  await db.user.create({ data: { ...input, name: input.name ?? null }, returning: { id: true, email: true, name: true } });
  res.status(201).json({ ok: true });
});

app.put('/users/:id', async (req, res) => {
  const patch = UserCreate.partial().parse(req.body);
  const updated = await db.user.update({
    where: { id: { '=': req.params.id } } as any,
    data: patch as any,
    returning: { id: true, email: true, name: true },
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

app.delete('/users/:id', async (req, res) => {
  await db.user.delete({ where: { id: { '=': req.params.id } } as any });
  res.status(204).send();
});

// POSTS
app.get('/posts', async (_req, res) => {
  const posts = await db.post.findMany({ orderBy: [{ createdAt: 'DESC' }] });
  res.json(posts);
});

app.get('/posts/:id', async (req, res) => {
  const post = await db.post.findUnique({ where: { id: { '=': req.params.id } } as any });
  if (!post) return res.status(404).json({ error: 'not_found' });
  res.json(post);
});

app.post('/posts', async (req, res) => {
  const input = PostCreate.parse(req.body);
  await db.post.create({
    data: {
      ...input,
      body: input.body ?? null,
      createdAt: new Date(),
    } as any,
    returning: { id: true },
  });
  res.status(201).json({ ok: true });
});

app.put('/posts/:id', async (req, res) => {
  const patch = PostCreate.partial().parse(req.body);
  const updated = await db.post.update({
    where: { id: { '=': req.params.id } } as any,
    data: patch as any,
    returning: { id: true, userId: true, title: true, body: true, createdAt: true },
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

app.delete('/posts/:id', async (req, res) => {
  await db.post.delete({ where: { id: { '=': req.params.id } } as any });
  res.status(204).send();
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
