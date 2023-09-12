import { Project } from "../dotnet/project-file-parser";
import { getGitHubContext } from "../environment";
import { logDebug, globSearch, runProcess, logInfo } from "../helpers";
import PackageJsonParser, { NodeJsPackage } from "./package-json-parser";

async function npmCommand(project: NodeJsPackage, ...commandArgs: string[]) {
    logDebug('running command', commandArgs, project);

    await runProcess("npm", commandArgs, {
        cwd: project.directoryPath
    });
}

async function npmPublish(project: NodeJsPackage) {
    const npmToken = process.env["NPM_TOKEN"];
    if(!npmToken) {
        throw new Error("Could not find NPM token.");
    }

    await pushNpmPackage({
        project,
        authToken: npmToken,
        registry: "registry.npmjs.org"
    });
    
    const github = await getGitHubContext();
    await pushNpmPackage({
        project,
        authToken: github.token,
        registry: "npm.pkg.github.com"
    });
}

async function pushNpmPackage(options: {
    project: NodeJsPackage,
    authToken: string,
    registry: string
}) {
    await npmCommand(options.project, 'set', `//${options.registry}/:_authToken`, options.authToken);
    await npmCommand(options.project, 'set', '@fluffy-spoon:registry', `https://${options.registry}`);
    await npmCommand(options.project, 'publish', '--access', 'public');
}

export default async function handleNodeJs() {
    logDebug('scanning for nodejs projects');

    var packageJsFiles = await globSearch("**/package.json", ["**/node_modules/**"]);
    logDebug('nodejs projects found', packageJsFiles);

    packageJsFiles = packageJsFiles
        .sort((a, b) => b.length - a.length)
        .filter(x => !!packageJsFiles.find(y => y === x || y.indexOf(x) > -1));

    logInfo('nodejs projects found', packageJsFiles);

    const github = await getGitHubContext();
    for (let packageJsFile of packageJsFiles) {
        let project = PackageJsonParser.readPackage(packageJsFile);
        logInfo('publishing project', packageJsFile, project);
        
        await npmCommand(project, 'version', '1.0.0');
        
        await npmCommand(project, 'install');

        if(project.hasBuildCommand)
            await npmCommand(project, 'run', 'build');

        if(project.hasTestCommand)
            await npmCommand(project, 'run', 'test');

        await npmPublish(project);
    }
}