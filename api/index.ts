/**
 * Вход для Vercel (serverless).
 *
 * Площадка раздаёт собранную статику из dist/ сама, а сюда приходят
 * запросы /api/* — их обслуживает тот же Express-апп, что и на Node-сервере.
 */
import { createApp } from '../server/app.ts';

export default createApp();
