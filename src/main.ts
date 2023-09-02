import handleDotNet from "./dotnet";
import { fail } from "./helpers";
import handleNodeJs from "./nodejs";

export async function run() {
    await handleNodeJs();
    await handleDotNet();
}

run();