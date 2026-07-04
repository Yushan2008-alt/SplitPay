import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SplitPay API')
    .setDescription('API documentation for SplitPay backend')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Masukkan access token JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Serve OpenAPI spec JSON at /api/docs-json
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    // ponytail: pnpm + express.static bug workaround — serve CDN HTML instead
    ui: false,
  });

  // Serve Swagger UI HTML manually from CDN
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/docs', (_req: Request, res: Response) => {
    res.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SplitPay API — Swagger</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <link rel="icon" type="image/png" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/favicon-32x32.png" sizes="32x32">
  <style>html { box-sizing: border-box; overflow-y: scroll; } body { margin:0; background: #fafafa; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"><\/script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/api/docs-json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      });
    };
  <\/script>
</body>
</html>`);
  });
}
