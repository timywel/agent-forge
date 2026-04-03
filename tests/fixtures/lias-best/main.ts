import { run } from "./src/loop.js";
import { provider } from "./src/provider.js";

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx tsx main.ts <input>");
    process.exit(1);
  }
  const input = args.join(" ");
  try {
    const result = await run(input, { workingDirectory: process.cwd(), env: process.env });
    console.log(result);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};
main();
