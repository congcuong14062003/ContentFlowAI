/** Transport contracts only. No backend implementation or environment configuration. */
export interface ApiSuccess<T> { data: T; requestId: string }
export interface ApiError { error: { code: string; message: string; details?: unknown }; requestId: string }
export interface CursorPage<T> { items: T[]; nextCursor: string | null }
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type SystemRole = 'USER' | 'SUPER_ADMIN';
export interface HealthStatus { status: 'ok' | 'error'; checks?: Record<string, 'up' | 'down'> }
export * from './catalog';
export * from './credits';
export * from './generator';
