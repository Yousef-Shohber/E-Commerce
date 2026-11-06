// Runs before the tests: configuration for a throw-away environment.
// DATABASE_URL can be passed from outside; by default it uses a local database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://nest:nest@localhost:5432/nest_e2e';
process.env.JWT_SECRET = 'e2e-secret';
process.env.JWT_EXPIRES_IN = '1d';
process.env.DOMAIN = 'http://localhost:3000';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '2525';
process.env.SMTP_USERNAME = 'sender@e2e.test';
process.env.SMTP_PASSWORD = 'x';
process.env.GOOGLE_CLIENT_ID = 'dummy';
process.env.GOOGLE_CLIENT_SECRET = 'dummy';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/cb';
process.env.CLOUDINARY_CLOUD_NAME = 'dummy';
process.env.CLOUDINARY_API_KEY = 'dummy';
process.env.CLOUDINARY_API_SECRET = 'dummy';
process.env.THROTTLE_DISABLED = 'true';
