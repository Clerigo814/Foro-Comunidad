import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(path.join(__dirname, "forum.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(post_id) REFERENCES posts(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  reply_id INTEGER,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const count = db.prepare("SELECT COUNT(*) AS n FROM categories").get().n;
if (!count) {
  const ins = db.prepare("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)");
  ins.run("Comunidad", "comunidad", "Presentaciones, conversación y temas generales.");
  ins.run("Fotografía", "fotografia", "Técnica, edición, iluminación y fotografía.");
  ins.run("Galería", "galeria", "Publicaciones multimedia sujetas a las reglas de la comunidad.");
  ins.run("Debates", "debates", "Opiniones, preguntas y conversaciones.");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "cambia-esta-clave-en-produccion",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));
app.use(express.static(path.join(__dirname, "public")));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: "Debes iniciar sesión." });
  next();
};

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: db.prepare("SELECT id, username FROM users WHERE id=?").get(req.session.userId) || null });
});

app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 6)
    return res.status(400).json({ error: "Usuario mínimo 3 caracteres y contraseña mínimo 6." });
  try {
    const info = db.prepare("INSERT INTO users (username,password) VALUES (?,?)").run(username.trim(), password);
    req.session.userId = info.lastInsertRowid;
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Ese nombre de usuario ya existe." });
  }
});

app.post("/api/login", (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE username=? AND password=?").get(req.body.username?.trim(), req.body.password);
  if (!u) return res.status(401).json({ error: "Credenciales incorrectas." });
  req.session.userId = u.id;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/categories", (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, COUNT(p.id) posts
    FROM categories c LEFT JOIN posts p ON p.category_id=c.id
    GROUP BY c.id ORDER BY c.id
  `).all());
});

app.get("/api/posts", (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = q
    ? db.prepare(`
      SELECT p.*, c.name category, u.username
      FROM posts p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.user_id
      WHERE p.title LIKE ? OR p.body LIKE ?
      ORDER BY p.created_at DESC LIMIT 100
    `).all(`%${q}%`, `%${q}%`)
    : db.prepare(`
      SELECT p.*, c.name category, u.username
      FROM posts p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.user_id
      ORDER BY p.created_at DESC LIMIT 100
    `).all();
  res.json(rows);
});

app.get("/api/posts/:id", (req, res) => {
  const post = db.prepare(`
    SELECT p.*, c.name category, u.username
    FROM posts p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.user_id
    WHERE p.id=?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: "Publicación no encontrada." });
  const replies = db.prepare(`
    SELECT r.*, u.username FROM replies r JOIN users u ON u.id=r.user_id
    WHERE r.post_id=? ORDER BY r.created_at
  `).all(req.params.id);
  res.json({ post, replies });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const { category_id, title, body } = req.body;
  if (!category_id || !title?.trim() || !body?.trim()) return res.status(400).json({ error: "Completa todos los campos." });
  const info = db.prepare("INSERT INTO posts (category_id,user_id,title,body) VALUES (?,?,?,?)")
    .run(Number(category_id), req.session.userId, title.trim(), body.trim());
  res.json({ id: info.lastInsertRowid });
});

app.post("/api/posts/:id/replies", requireAuth, (req, res) => {
  if (!req.body.body?.trim()) return res.status(400).json({ error: "Escribe una respuesta." });
  db.prepare("INSERT INTO replies (post_id,user_id,body) VALUES (?,?,?)")
    .run(req.params.id, req.session.userId, req.body.body.trim());
  res.json({ ok: true });
});

app.post("/api/reports", requireAuth, (req, res) => {
  const { post_id, reply_id, reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: "Indica el motivo." });
  db.prepare("INSERT INTO reports (post_id,reply_id,reason) VALUES (?,?,?)")
    .run(post_id || null, reply_id || null, reason.trim());
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => console.log("Foro ejecutándose en http://localhost:3000"));
