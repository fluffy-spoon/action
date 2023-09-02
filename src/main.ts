import handleDotNet from "./dotnet";
import { fail } from "./helpers";
import handleNodeJs from "./nodejs";

async function run() {
    await Promise.all([
        handleNodeJs(),
        handleDotNet()
    ]);
}

run().catch(fail);
export default run; 

