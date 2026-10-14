import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "fixture", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo the text back",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      name: "fail",
      description: "Always fails",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "env",
      description: "Reads a variable from the server environment",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  if (name === "echo")
    return { content: [{ type: "text", text: `echo: ${args.text}` }] };
  if (name === "env")
    return {
      content: [
        { type: "text", text: String(process.env[args.name] ?? "unset") },
      ],
    };
  return { isError: true, content: [{ type: "text", text: "boom" }] };
});

await server.connect(new StdioServerTransport());
