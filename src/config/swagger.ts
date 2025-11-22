import swaggerJsdoc from 'swagger-jsdoc';
import { config, isProduction } from './env';
import path from 'path';

// Use different paths for development (TypeScript) vs production (JavaScript)
const apiPaths = isProduction
  ? [
      path.join(__dirname, '../routes/**/*.js'),
      path.join(__dirname, '../index.js'),
    ]
  : [
      './src/routes/**/*.ts',
      './src/index.ts',
    ];

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.app.name,
      version: '1.0.0',
      description: 'API documentation for PolySignal Copy Trading',
    },
    servers: [
      {
        url: 'https://poly.dev.api.polysignal.io',
        description: 'Production server',
      },
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: apiPaths, // Paths to files containing OpenAPI definitions
};

export const swaggerSpec = swaggerJsdoc(options);

