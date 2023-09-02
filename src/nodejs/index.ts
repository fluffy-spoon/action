import { logDebug, globSearch, runProcess, logInfo } from "../helpers";
import PackageJsonParser, { NodeJsPackage } from "./package-json-parser";

async function npmCommand(project: NodeJsPackage, ...commandArgs: string[]) {
    logDebug('running command', commandArgs, project);

    await runProcess("npm", commandArgs, {
        cwd: project.directoryPath
    });
}

async function npmPublish(project: NodeJsPackage) {
    
}

export default async function handleNodeJs() {
    logDebug('scanning for nodejs projects');

    var packageJsFiles = await globSearch("**/package.json", ["**/node_modules/**"]);
    logDebug('nodejs projects found', packageJsFiles);

    packageJsFiles = packageJsFiles
        .sort((a, b) => b.length - a.length)
        .filter(x => !!packageJsFiles.find(y => y === x || y.indexOf(x) > -1));

    logInfo('nodejs projects found', packageJsFiles);

    for (let packageJsFile of packageJsFiles) {
        let project = PackageJsonParser.readPackage(packageJsFile);
        logInfo('publishing project', packageJsFile, project);
        
        await npmCommand(project, 'install');

        if(project.hasBuildCommand)
            await npmCommand(project, 'run', 'build');

        if(project.hasTestCommand)
            await npmCommand(project, 'run', 'test');

        await npmPublish(project);
    }
}