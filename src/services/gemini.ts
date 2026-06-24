import { GoogleGenAI } from '@google/genai';

export function getApiKey(): string {
  // 1. Process environment (server-side Node)
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  // 2. LocalStorage (client-side browser)
  if (typeof localStorage !== 'undefined') {
    const localKey = localStorage.getItem('GEMINI_API_KEY');
    if (localKey) return localKey;
  }
  
  // 3. Vite environment
  // @ts-ignore
  const viteKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY;
  if (viteKey) return viteKey;

  // @ts-ignore
  const envKey = typeof import.meta !== 'undefined' && import.meta.env?.GEMINI_API_KEY;
  if (envKey) return envKey;

  // 4. Window global
  if (typeof window !== 'undefined') {
    const windowKey = (window as any).GEMINI_API_KEY;
    if (windowKey) return windowKey;
  }

  return '';
}

export function saveApiKey(key: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('GEMINI_API_KEY', key);
  }
}

let cachedKey = '';
let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const key = getApiKey();
  if (!key) return null;
  if (key !== cachedKey || !cachedClient) {
    cachedKey = key;
    // Note: GoogleGenAI client expects apiKey to be passed
    cachedClient = new GoogleGenAI({ apiKey: key });
  }
  return cachedClient;
}

export interface GeneratedPlan {
  goal: string;
  subtasks: string[];
  estimated_hours: number;
  difficulty: number; // 1 to 10
  impact: number; // 1 to 10
}

export interface TriagePlan {
  must_do: string[];
  skip: string[];
  justification: string;
}

export interface TrimmedScopePlan {
  subtasks: string[];
  justification: string;
}

/**
 * Generate a structured plan for a user's goal.
 */
export async function generateTaskPlan(prompt: string): Promise<GeneratedPlan> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Please break down the following goal/task into a structured plan: "${prompt}"`,
    config: {
      systemInstruction: 'You are DeadlineOS AI Task Brain. Decompose the goal into subtasks (3 to 6 tasks), estimate the effort required in hours, estimate the difficulty (1 to 10), and estimate the impact (1 to 10). Output ONLY valid JSON matching the specified schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          goal: { type: 'STRING', description: 'A short capitalized title for the goal' },
          subtasks: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'List of specific actionable subtasks to accomplish the goal'
          },
          estimated_hours: { type: 'INTEGER', description: 'Total estimated hours to complete' },
          difficulty: { type: 'INTEGER', description: 'Difficulty rating from 1 (easy) to 10 (hard)' },
          impact: { type: 'INTEGER', description: 'Impact rating from 1 (low) to 10 (critical)' }
        },
        required: ['goal', 'subtasks', 'estimated_hours', 'difficulty', 'impact']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as GeneratedPlan;
}

/**
 * Triage tasks for Panic Mode based on remaining time.
 */
export async function generatePanicTriage(
  taskTitle: string,
  subtasks: string[],
  hoursLeft: number
): Promise<TriagePlan> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Goal/Task: "${taskTitle}"\nSubtasks: ${JSON.stringify(subtasks)}\nTime Remaining: ${hoursLeft} hours`,
    config: {
      systemInstruction: 'You are the DeadlineOS Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching the specified schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          must_do: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Critical path subtasks that MUST be done'
          },
          skip: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Non-critical subtasks that should be skipped or deferred'
          },
          justification: {
            type: 'STRING',
            description: 'Short reason explaining why certain tasks were cut'
          }
        },
        required: ['must_do', 'skip', 'justification']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as TriagePlan;
}

/**
 * Trim the scope of a task plan by 30%.
 */
export async function generateScopeReduction(
  taskTitle: string,
  subtasks: string[]
): Promise<TrimmedScopePlan> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Task: "${taskTitle}"\nCurrent Subtasks: ${JSON.stringify(subtasks)}`,
    config: {
      systemInstruction: 'You are the DeadlineOS Anti-Procrastination Coach. Trim the scope of the subtasks by roughly 30% to salvage a slipping deadline, keeping only the bare minimum core value. Output ONLY valid JSON matching the specified schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          subtasks: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Reduced/simplified list of subtasks'
          },
          justification: {
            type: 'STRING',
            description: 'Encouraging reason explaining the scope trim recommendation'
          }
        },
        required: ['subtasks', 'justification']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as TrimmedScopePlan;
}

/**
 * Voice Assistant helper for talking to user.
 */
export async function getVoicePlanningResponse(userSpeechInput: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    return 'Please set your Gemini API key in settings first.';
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userSpeechInput,
    config: {
      systemInstruction: 'You are the voice assistant for DeadlineOS, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly.'
    }
  });

  return response.text || 'Understood, let us keep pushing toward the deadline.';
}
