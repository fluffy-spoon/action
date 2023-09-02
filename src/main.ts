import handleDotNet from "./dotnet";
import { fail } from "./helpers";
import handleNodeJs from "./nodejs";

async function run() {
    await handleNodeJs();
    await handleDotNet();
}

run().catch(fail);
export default run; 

