// Environment validation
function validateEnv() {
  const errors: string[] = [];

  // Required environment variables
  const required = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  };

  // Check required variables
  Object.entries(required).forEach(([key, value]) => {
    if (!value || value.trim() === "") {
      errors.push(`Missing required environment variable: ${key}`);
    }
  });

  // Validate at least one AI provider is configured
  const aiProviders = [
    process.env.OPENAI_API_KEY,
    process.env.GROQ_API_KEY,
    process.env.XAI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.MISTRAL_API_KEY,
    process.env.DEEPSEEK_API_KEY,
    process.env.TOGETHERAI_API_KEY,
    process.env.COHERE_API_KEY,
    process.env.FIREWORKS_API_KEY,
    process.env.DEEPINFRA_API_KEY,
    process.env.CEREBRAS_API_KEY,
  ];

  const hasAiProvider = aiProviders.some((key) => key && key.trim() !== "");
  if (!hasAiProvider) {
    errors.push("At least one AI provider API key must be configured");
  }

  // Validate AI provider/model combination
  const aiProvider = process.env.AI_PROVIDER?.toLowerCase() || "openai";
  const providerKeyMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    groq: "GROQ_API_KEY",
    xai: "XAI_API_KEY",
    google: "GOOGLE_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    togetherai: "TOGETHERAI_API_KEY",
    cohere: "COHERE_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
  };

  const requiredKey = providerKeyMap[aiProvider];
  if (requiredKey && !process.env[requiredKey]) {
    errors.push(
      `AI provider "${aiProvider}" requires ${requiredKey} to be set`,
    );
  }

  // Validate port
  const port = parseInt(process.env.PORT || "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push("PORT must be a valid number between 1 and 65535");
  }

  if (errors.length > 0) {
    console.error("❌ Environment validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error(
      "\nPlease check your .env file and ensure all required variables are set.",
    );
    process.exit(1);
  }

  console.log("✅ Environment validation passed");
}

// Run validation
validateEnv();

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
