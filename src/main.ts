import handleDotNet from "./dotnet";
import { fail, runProcess } from "./helpers";
import * as gitSourceProvider from './git/checkout/src/git-source-provider';
import * as inputHelper from './git/checkout/src/input-helper';
import handleNodeJs from "./nodejs";
import { getGitHubContext } from "./environment";

async function gitCheckout() {
    const context = await getGitHubContext();

    await gitSourceProvider.getSource({
        ...await inputHelper.getInputs(),
        submodules: true,
        authToken: context.token
    });
}

async function run() {
    await gitCheckout();

    await handleNodeJs();
    await handleDotNet();
}

run().catch(fail);
export default run; 

