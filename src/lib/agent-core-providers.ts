import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
export const client = new BedrockAgentCoreClient({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN!,
    }
});