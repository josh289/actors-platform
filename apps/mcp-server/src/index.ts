import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchActorsTool } from './tools/search-actors';
import { getPatternsTool } from './tools/get-patterns';
import { queryKnowledgeTool } from './tools/query-knowledge';
import { analyzeRequirementsTool } from './tools/analyze-requirements';
import { designModelsTool } from './tools/design-models';
import { designArchitectureTool } from './tools/design-architecture';
import { generateCodeTool } from './tools/generate-code';
import { deploySystemTool } from './tools/deploy-system';
import { generateDocsTool } from './tools/generate-docs';
import { getActorCodeTool } from './tools/get-actor-code';

const server = new Server(
  {
    name: 'actors-platform-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all tools
const tools = [
  searchActorsTool,
  getPatternsTool,
  queryKnowledgeTool,
  getActorCodeTool,
  analyzeRequirementsTool,
  designModelsTool,
  designArchitectureTool,
  generateCodeTool,
  deploySystemTool,
  generateDocsTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find(t => t.name === request.params.name);
  
  if (!tool) {
    throw new Error(`Tool not found: ${request.params.name}`);
  }

  try {
    const result = await tool.handler(request.params.arguments || {});
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});