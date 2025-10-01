export const config = {
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    supabase: {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    ai: {
      groqApiKey: process.env.GROQ_API_KEY || '',
      mistralApiKey: process.env.MISTRAL_API_KEY || '',
    },
    calendar: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      },
    },
    whatsapp: {
      sessionPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp-session',
      messageFilterMode: parseInt(process.env.WHATSAPP_MESSAGE_FILTER_MODE || '2', 10) as 1 | 2 | 3,
    },
  };
  