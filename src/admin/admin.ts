import { Express } from 'express';
import { config, isDevelopment } from '../config/env';

export const setupAdmin = async (app: Express) => {
  // Skip AdminJS in development mode since we're using in-memory database
  if (isDevelopment) {
    console.log('⚠️  AdminJS skipped in development mode (using in-memory database)');
    return;
  }

  // Lazy load AdminJS only in production to avoid import errors in development
  try {
    // Use require for dynamic loading in CommonJS
    const AdminJS = require('adminjs').default;
    const AdminJSExpress = require('@adminjs/express').default;
    const { Database, Resource } = require('@adminjs/prisma');
    const { prisma } = require('../config/database');

    // Initialize AdminJS with Prisma adapter
    AdminJS.registerAdapter({ Database, Resource });

    const adminJs = new AdminJS({
      resources: [
        {
          resource: { model: prisma.user, client: prisma },
          options: {},
        },
      ],
      rootPath: '/admin',
      branding: {
        companyName: config.app.name,
        logo: false,
      },
    });

    const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
      adminJs,
      {
        authenticate: async (email, password) => {
          // TODO: Implement authentication logic
          // For now, allow any credentials
          return { email: 'admin@example.com' };
        },
        cookieName: 'adminjs',
        cookiePassword: config.adminjs.cookieSecret,
      },
      null,
      {
        resave: false,
        saveUninitialized: false,
        secret: config.adminjs.sessionSecret,
        cookie: {
          httpOnly: true,
          secure: true,
        },
      }
    );

    app.use(adminJs.options.rootPath, adminRouter);

    console.log(`✅ AdminJS panel available at ${config.app.url}/admin`);
  } catch (error) {
    console.error('⚠️  Failed to load AdminJS:', error);
    console.log('⚠️  AdminJS will be skipped');
  }
};

