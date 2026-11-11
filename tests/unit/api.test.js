import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Se simula la capa de base de datos: estas pruebas no tocan MySQL.
jest.mock('../../src/config/db.js', () => ({
  callProcedure: jest.fn(),
  pool: {},
  testConnection: jest.fn(),
  closePool: jest.fn(),
}));

// eslint-disable-next-line import/first
import { callProcedure } from '../../src/config/db.js';
// eslint-disable-next-line import/first
import app from '../../src/app.js';

const SECRET = process.env.JWT_KEY;
const PASSWORD = 'Secreta123!';
let passwordHash;

const validUserRow = () => ({
  id_usuario: 7,
  nombre: 'ana',
  password: passwordHash,
  nombre_rol: 'admin',
});
const tokenFor = (payload = { id: 7, username: 'ana', role: 'admin' }, options = {}) =>
  jwt.sign(payload, SECRET, { expiresIn: '1h', ...options });

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  callProcedure.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Autenticación JWT en /api', () => {
  test('sin token responde 403 (contrato original)', async () => {
    const res = await request(app).get('/api/example');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No se proporcionó token/);
  });

  test('formato incorrecto responde 403', async () => {
    const res = await request(app).get('/api/example').set('Authorization', 'Token abc');
    expect(res.status).toBe(403);
  });

  test('token inválido o firmado con otro secreto responde 401', async () => {
    const forged = jwt.sign({ id: 1 }, 'otro-secreto');
    const res = await request(app).get('/api/example').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('token expirado responde 401', async () => {
    const expired = tokenFor(undefined, { expiresIn: -10 });
    const res = await request(app).get('/api/example').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('token sin firma (alg none) es rechazado', async () => {
    const unsigned = jwt.sign({ id: 1 }, null, { algorithm: 'none' });
    const res = await request(app).get('/api/example').set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  test('token válido da acceso a /api/example', async () => {
    const res = await request(app).get('/api/example').set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Hello from SOA!' });
  });

  test('/api/products sigue protegido por JWT como antes', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(403);
    expect(callProcedure).not.toHaveBeenCalled();
  });
});

describe('Productos', () => {
  const auth = () => ({ Authorization: `Bearer ${tokenFor()}` });

  test('GET /api/products conserva la forma de respuesta del CALL', async () => {
    const callResult = [[{ id: 1, nombre: 'Prod' }], { affectedRows: 0 }];
    callProcedure.mockResolvedValue([callResult, undefined]);
    const res = await request(app).get('/api/products').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(callResult);
    expect(callProcedure).toHaveBeenCalledWith('get_all_products');
  });

  test('GET /api/products/:id usa parámetros enlazados', async () => {
    callProcedure.mockResolvedValue([[[{ id: 5 }], {}], undefined]);
    const res = await request(app).get('/api/products/5').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 5 }]);
    expect(callProcedure).toHaveBeenCalledWith('get_Prod_ByID', ['5']);
  });

  test('GET /api/products/:id con id demasiado largo responde 400', async () => {
    const res = await request(app).get(`/api/products/${'1'.repeat(65)}`).set(auth());
    expect(res.status).toBe(400);
    expect(callProcedure).not.toHaveBeenCalled();
  });

  test('un error de BD no expone detalles internos', async () => {
    callProcedure.mockRejectedValue(
      Object.assign(new Error("Table 'secret_db.productos' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }),
    );
    const res = await request(app).get('/api/products').set(auth());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Error interno del servidor' });
  });

  test('BD caída responde 503', async () => {
    callProcedure.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const res = await request(app).get('/api/products/1').set(auth());
    expect(res.status).toBe(503);
    expect(res.body.message).not.toMatch(/ECONNREFUSED/);
  });
});

describe('Login', () => {
  test('POST /user/login con credenciales válidas devuelve un JWT válido', async () => {
    callProcedure.mockResolvedValue([[[validUserRow()], {}], undefined]);
    const res = await request(app).post('/user/login').send({ username: 'ana', password: PASSWORD });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, SECRET, { algorithms: ['HS256'] });
    expect(decoded).toMatchObject({ id: 7, username: 'ana', role: 'admin' });
    expect(decoded.exp - decoded.iat).toBe(3600);
    expect(callProcedure).toHaveBeenCalledWith('validateUserCredentials', ['ana']);
  });

  test('GET /user/login se mantiene por compatibilidad', async () => {
    callProcedure.mockResolvedValue([[[validUserRow()], {}], undefined]);
    const res = await request(app).get('/user/login').send({ username: 'ana', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('contraseña incorrecta responde 401 genérico', async () => {
    callProcedure.mockResolvedValue([[[validUserRow()], {}], undefined]);
    const res = await request(app).post('/user/login').send({ username: 'ana', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas' });
  });

  test('usuario inexistente responde igual que contraseña incorrecta', async () => {
    callProcedure.mockResolvedValue([[[], {}], undefined]);
    const res = await request(app).post('/user/login').send({ username: 'nadie', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas' });
  });

  test('datos de usuario incompletos no revelan que el usuario existe', async () => {
    callProcedure.mockResolvedValue([[[{ ...validUserRow(), nombre_rol: null }], {}], undefined]);
    const res = await request(app).post('/user/login').send({ username: 'ana', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Credenciales inválidas' });
  });

  test.each([
    [{}],
    [{ username: 'ana' }],
    [{ password: 'x' }],
    [{ username: { $gt: '' }, password: 'x' }],
    [{ username: ['a', 'b'], password: 'x' }],
  ])('entrada inválida %j responde 400 sin consultar la BD', async (body) => {
    const res = await request(app).post('/user/login').send(body);
    expect(res.status).toBe(400);
    expect(callProcedure).not.toHaveBeenCalled();
  });

  test('JSON mal formado responde 400 en JSON', async () => {
    const res = await request(app)
      .post('/user/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JSON/);
  });

  test('error de BD en login responde 500 genérico', async () => {
    callProcedure.mockRejectedValue(new Error('boom interno'));
    const res = await request(app).post('/user/login').send({ username: 'ana', password: 'x' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
  });
});

describe('Crear usuario', () => {
  const body = {
    p_username: 'nuevo',
    p_password_hash: 'ClaveSegura123',
    email_user: 'nuevo@example.com',
    Estatus_User: 1,
    CreateByDateU: '2026-11-11',
  };

  test('crea el usuario guardando un hash bcrypt, nunca la contraseña en claro', async () => {
    callProcedure.mockResolvedValue([[[{ id: 99 }], {}], undefined]);
    const res = await request(app).post('/user/CreateUser').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Usuario creado exitosamente', result: [{ id: 99 }] });
    const [name, params] = callProcedure.mock.calls[0];
    expect(name).toBe('CrearUsuario');
    expect(params[0]).toBe('nuevo');
    expect(params[1]).not.toBe(body.p_password_hash);
    expect(await bcrypt.compare(body.p_password_hash, params[1])).toBe(true);
    expect(params.slice(2)).toEqual(['nuevo@example.com', 1, '2026-11-11']);
  });

  test('faltan campos obligatorios -> 400 (mensaje original)', async () => {
    const res = await request(app).post('/user/CreateUser').send({ p_username: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Todos los campos son obligatorios');
  });

  test('email inválido -> 400 con detalle', async () => {
    const res = await request(app).post('/user/CreateUser').send({ ...body, email_user: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/email_user/)]));
    expect(callProcedure).not.toHaveBeenCalled();
  });

  test('contraseña de más de 72 bytes -> 400 (bcrypt la truncaría)', async () => {
    const res = await request(app).post('/user/CreateUser').send({ ...body, p_password_hash: 'a'.repeat(73) });
    expect(res.status).toBe(400);
  });

  test('objetos en parámetros SQL -> 400', async () => {
    const res = await request(app).post('/user/CreateUser').send({ ...body, Estatus_User: { a: 1 } });
    expect(res.status).toBe(400);
    expect(callProcedure).not.toHaveBeenCalled();
  });

  test('SIGNAL 45000 del procedimiento -> 400 con su mensaje (contrato original)', async () => {
    callProcedure.mockRejectedValue(Object.assign(new Error('El usuario ya existe'), { sqlState: '45000' }));
    const res = await request(app).post('/user/CreateUser').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'El usuario ya existe' });
  });

  test('clave duplicada -> 409', async () => {
    callProcedure.mockRejectedValue(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }));
    const res = await request(app).post('/user/CreateUser').send(body);
    expect(res.status).toBe(409);
  });
});

describe('Errores generales y seguridad', () => {
  test('ruta inexistente -> 404 JSON', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Recurso no encontrado' });
  });

  test('no expone X-Powered-By y añade cabeceras de seguridad', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('cuerpo demasiado grande -> 413', async () => {
    const res = await request(app)
      .post('/user/login')
      .send({ username: 'a', password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });

  test('rate limit de login bloquea tras 10 intentos fallidos', async () => {
    callProcedure.mockResolvedValue([[[], {}], undefined]);
    const agent = request(app);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await agent.post('/user/login').send({ username: 'bruto', password: `p${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
