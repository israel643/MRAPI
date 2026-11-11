/**
 * Pruebas de integración contra un MySQL/MariaDB REAL y DESECHABLE.
 * Solo se ejecutan si se define TEST_DB_HOST (y TEST_DB_USER / TEST_DB_NAME).
 * Antes de ejecutarlas cargue tests/integration/fixtures.sql en esa base de datos.
 * Nunca apunte estas variables a la base de datos de producción.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const enabled = Boolean(process.env.TEST_DB_HOST);
const describeIf = enabled ? describe : describe.skip;

describeIf('Integración con MySQL', () => {
  let app;
  let db;
  let token;
  const username = `it_user_${Date.now()}`;
  const password = 'ClaveIntegracion123';

  beforeAll(async () => {
    db = await import('../../src/config/db.js');
    app = (await import('../../src/app.js')).default;
    await db.testConnection();
  });

  afterAll(async () => {
    if (db) {
      await db.pool.query('DELETE FROM usuarios WHERE nombre = ?', [username]);
      await db.closePool();
    }
  });

  test('crea un usuario y lo rechaza si ya existe (SIGNAL 45000)', async () => {
    const body = {
      p_username: username,
      p_password_hash: password,
      email_user: `${username}@example.com`,
      Estatus_User: 'activo',
      CreateByDateU: '2026-11-11',
    };
    const created = await request(app).post('/user/CreateUser').send(body);
    expect(created.status).toBe(201);
    expect(created.body.message).toBe('Usuario creado exitosamente');

    const [rows] = await db.pool.query('SELECT password FROM usuarios WHERE nombre = ?', [username]);
    expect(rows[0].password).toMatch(/^\$2[aby]\$10\$/);

    const dup = await request(app).post('/user/CreateUser').send(body);
    expect(dup.status).toBe(400);
    expect(dup.body).toEqual({ message: 'El usuario ya existe' });
  });

  test('login correcto devuelve JWT; incorrecto devuelve 401', async () => {
    const ok = await request(app).post('/user/login').send({ username, password });
    expect(ok.status).toBe(200);
    token = ok.body.token;
    expect(jwt.verify(token, process.env.JWT_KEY)).toMatchObject({ username, role: 'usuario' });

    const bad = await request(app).post('/user/login').send({ username, password: 'incorrecta' });
    expect(bad.status).toBe(401);
  });

  test('intento de inyección SQL en el login no tiene efecto', async () => {
    const res = await request(app)
      .post('/user/login')
      .send({ username: "' OR '1'='1' -- ", password: 'x' });
    expect(res.status).toBe(401);
  });

  test('productos: listado y detalle mantienen la forma del CALL', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const all = await request(app).get('/api/products').set(auth);
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body[0])).toBe(true);
    expect(all.body[0].length).toBeGreaterThanOrEqual(2);

    const one = await request(app).get('/api/products/1').set(auth);
    expect(one.status).toBe(200);
    expect(one.body[0]).toMatchObject({ id_producto: 1 });

    const none = await request(app).get('/api/products/999999').set(auth);
    expect(none.status).toBe(200);
    expect(none.body).toEqual([]);
  });
});
