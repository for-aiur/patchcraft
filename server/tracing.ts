import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { CallbackHandler } from '@langfuse/langchain';
let sdk:NodeTracerProvider|undefined;
export function traceCallbacks() {
  if(!process.env.LANGFUSE_PUBLIC_KEY||!process.env.LANGFUSE_SECRET_KEY||!process.env.LANGFUSE_BASE_URL)return [];
  if(!sdk){sdk=new NodeTracerProvider({spanProcessors:[new LangfuseSpanProcessor()]});sdk.register();}
  return [new CallbackHandler({tags:['patchcraft','authoring','explicit-consent']})];
}
export async function closeTracing(){await sdk?.shutdown();}
