'use server';

import pool, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export interface UserLimits {
  daily_limit_openai: number;
  daily_limit_gemini: number;
  is_unlimited: boolean;
}

export interface DailyUsage {
  provider: 'openai' | 'gemini';
  request_count: number;
  tokens_used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

/**
 * Obtiene los límites configurados para un usuario
 */
export async function getUserLimits(userId: number): Promise<UserLimits | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT daily_limit_openai, daily_limit_gemini, is_unlimited 
     FROM ${dbName}.ai_user_config 
     WHERE user_id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    daily_limit_openai: rows[0].daily_limit_openai || 500,
    daily_limit_gemini: rows[0].daily_limit_gemini || 1000,
    is_unlimited: rows[0].is_unlimited || false,
  };
}

/**
 * Obtiene el uso diario actual de un usuario
 */
export async function getDailyUsage(
  userId: number,
  provider: 'openai' | 'gemini'
): Promise<DailyUsage> {
  const today = new Date().toISOString().split('T')[0];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT request_count, tokens_used 
     FROM ${dbName}.ai_daily_usage 
     WHERE user_id = ? AND provider = ? AND usage_date = ?`,
    [userId, provider, today]
  );

  const limits = await getUserLimits(userId);
  const limit = provider === 'openai'
    ? limits?.daily_limit_openai || 500
    : limits?.daily_limit_gemini || 1000;

  const current = rows.length > 0 ? rows[0] : { request_count: 0, tokens_used: 0 };
  const requestCount = current.request_count || 0;

  return {
    provider,
    request_count: requestCount,
    tokens_used: current.tokens_used || 0,
    limit,
    remaining: Math.max(0, limit - requestCount),
    percentage: limit > 0 ? Math.min(100, (requestCount / limit) * 100) : 0,
  };
}

/**
 * Verifica si un usuario puede hacer una request
 */
export async function canMakeRequest(
  userId: number,
  provider: 'openai' | 'gemini'
): Promise<{ allowed: boolean; reason?: string; usage?: DailyUsage }> {
  const limits = await getUserLimits(userId);

  // Si es unlimited, siempre puede
  if (limits?.is_unlimited) {
    return { allowed: true };
  }

  const usage = await getDailyUsage(userId, provider);

  if (usage.remaining <= 0) {
    return {
      allowed: false,
      reason: `Has alcanzado tu límite diario de ${usage.limit} análisis con ${provider === 'openai' ? 'OpenAI' : 'Gemini'}. El límite se reinicia a las 00:00 hs.`,
      usage,
    };
  }

  return { allowed: true, usage };
}

/**
 * Incrementa el contador de uso diario
 */
export async function incrementDailyUsage(
  userId: number,
  provider: 'openai' | 'gemini',
  tokensUsed: number = 0
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await pool.query(
    `INSERT INTO ${dbName}.ai_daily_usage 
     (user_id, provider, usage_date, request_count, tokens_used)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE 
       request_count = request_count + 1,
       tokens_used = tokens_used + ?`,
    [userId, provider, today, tokensUsed, tokensUsed]
  );
}

/**
 * Obtiene el uso de todos los providers de un usuario
 */
export async function getAllDailyUsage(userId: number): Promise<{
  openai: DailyUsage;
  gemini: DailyUsage;
  is_unlimited: boolean;
}> {
  const limits = await getUserLimits(userId);
  const openaiUsage = await getDailyUsage(userId, 'openai');
  const geminiUsage = await getDailyUsage(userId, 'gemini');

  return {
    openai: openaiUsage,
    gemini: geminiUsage,
    is_unlimited: limits?.is_unlimited || false,
  };
}