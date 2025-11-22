import { Express } from 'express';
import { config, isDevelopment, isProduction } from '../config/env';

export const setupAdmin = async (app: Express) => {
  // Skip AdminJS in development mode since we're using in-memory database
  if (isDevelopment) {
    console.log('⚠️  AdminJS skipped in development mode (using in-memory database)');
    return;
  }

  // Lazy load AdminJS only in production to avoid import errors in development
  try {
    // Use require for CommonJS modules
    const adminjsModule = require('adminjs');
    const AdminJS = adminjsModule.default || adminjsModule;
    
    // @adminjs/express v5 is CommonJS compatible
    const AdminJSExpress = require('@adminjs/express');
    const Connect = require('connect-pg-simple');
    const session = require('express-session');
    
    // Use Sequelize adapter instead of Prisma
    const { Database, Resource } = require('@adminjs/sequelize');
    const { Sequelize } = require('sequelize');
    
    // Create Sequelize connection to the same PostgreSQL database
    const sequelize = new Sequelize(config.database.url, {
      dialect: 'postgres',
      logging: false, // Set to console.log if you want to see SQL queries
    });

    // Initialize AdminJS with Sequelize adapter
    AdminJS.registerAdapter({ Database, Resource });

    // For now, just use the database connection - AdminJS will auto-discover tables
    const adminJs = new AdminJS({
      databases: [sequelize],

    // Resources will be auto-discovered from the database
      rootPath: '/admin',
      branding: {
        companyName: config.app.name,
        logo: false,
      },
    });

    // Setup PostgreSQL session store for production
    const ConnectSession = Connect(session);
    const sessionStore = new ConnectSession({
      conObject: {
        connectionString: config.database.url,
        ssl: false, // Disable SSL for local Docker PostgreSQL
      },
      tableName: 'adminjs_session',
      createTableIfMissing: true,
    });

    const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
      adminJs,
      {
        authenticate: async (_email: string, _password: string) => {
          // TODO: Implement authentication logic
          // For now, allow any credentials
          return { email: 'admin@example.com' };
        },
        cookieName: 'adminjs',
        cookiePassword: config.adminjs.cookieSecret,
      },
      null,
      {
        store: sessionStore,
        resave: true,
        saveUninitialized: true,
        secret: config.adminjs.sessionSecret,
        cookie: {
          httpOnly: true,
          secure: isProduction,
        },
        name: 'adminjs',
      }
    );

    app.use(adminJs.options.rootPath, adminRouter);

    console.log(`✅ AdminJS panel available at ${config.app.url}/admin`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Suppress known AdminJS dependency issues (tiptap/core compatibility)
    if (errorMessage.includes('@tiptap/core') || errorMessage.includes('canInsertNode')) {
      console.log('⚠️  AdminJS skipped due to dependency compatibility issue (non-critical)');
    } else {
      console.error('⚠️  Failed to load AdminJS:', error);
      console.log('⚠️  AdminJS will be skipped');
    }
  }
};

