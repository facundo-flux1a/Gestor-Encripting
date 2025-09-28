'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-document.ts';
import '@/ai/flows/analyze-incidents.ts';
import '@/ai/flows/analyze-single-document.ts';
