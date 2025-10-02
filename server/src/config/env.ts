export const config = {
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    nodeEnv: process.env.NODE_ENV || "development",
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceKey: process.env.SUPABASE_SERVICE_KEY || "",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || "",
  },
  ai: {
    // Provider and Model Selection
    provider: process.env.AI_PROVIDER || "openai",
    model: process.env.AI_MODEL || "gpt-4o-mini",

    // API Keys
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    groqApiKey: process.env.GROQ_API_KEY || "",
    xaiApiKey: process.env.XAI_API_KEY || "",
    googleApiKey: process.env.GOOGLE_API_KEY || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    mistralApiKey: process.env.MISTRAL_API_KEY || "",
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
    togetheraiApiKey: process.env.TOGETHERAI_API_KEY || "",
    cohereApiKey: process.env.COHERE_API_KEY || "",
    fireworksApiKey: process.env.FIREWORKS_API_KEY || "",
    deepinfraApiKey: process.env.DEEPINFRA_API_KEY || "",
    cerebrasApiKey: process.env.CEREBRAS_API_KEY || "",

    // Azure OpenAI
    azureApiKey: process.env.AZURE_OPENAI_API_KEY || "",
    azureResourceName: process.env.AZURE_RESOURCE_NAME || "",
    azureDeploymentName: process.env.AZURE_DEPLOYMENT_NAME || "",

    // Google Vertex AI
    vertexProjectId: process.env.VERTEX_PROJECT_ID || "",
    vertexLocation: process.env.VERTEX_LOCATION || "",

    // AWS Bedrock
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    awsRegion: process.env.AWS_REGION || "",
  },
  calendar: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    },
  },
  whatsapp: {
    sessionPath: process.env.WHATSAPP_SESSION_PATH || "./whatsapp-session",
    messageFilterMode: parseInt(
      process.env.WHATSAPP_MESSAGE_FILTER_MODE || "2",
      10,
    ) as 1 | 2 | 3,
    allowedNumbers: process.env.WHATSAPP_ALLOWED_NUMBERS
      ? process.env.WHATSAPP_ALLOWED_NUMBERS.split(",").map((num) => num.trim())
      : [],
  },
};
