import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false });
  try {
    await configureApp(app);
    await app.listen(app.get(ConfigService).get<number>('API_PORT', 3000), '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }
}
void main().catch(() => { process.stderr.write('API startup failed. Check configuration and dependency availability.\n'); process.exitCode = 1; });
