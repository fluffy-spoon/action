import { logDebug, globSearch, runProcess } from "../helpers";
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
    logDebug('installing node');

    let nodeInstaller = await import('./setup-node/src/installer');
    await nodeInstaller.getNode('10.x');

    logDebug('scanning for nodejs projects');

    var packageJsFiles = await globSearch("**/package.json", ["**/node_modules/**"]);
    logDebug('nodejs projects found', packageJsFiles);

    packageJsFiles = packageJsFiles
        .sort((a, b) => b.length - a.length)
        .filter(x => !!packageJsFiles.find(y => y === x || y.indexOf(x) > -1));

    logDebug('nodejs projects filtered', packageJsFiles);

    for (let packageJsFile of packageJsFiles) {
        let project = PackageJsonParser.readPackage(packageJsFile);
        logDebug('project detected', packageJsFile, project);
        
        await npmCommand(project, 'install');

        if(project.hasBuildCommand)
            await npmCommand(project, 'run', 'build');

        if(project.hasTestCommand)
            await npmCommand(project, 'run', 'test');

        await npmPublish(project);
    }
}